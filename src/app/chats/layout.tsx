'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/telegram/auth';
import { useAppStore } from '@/lib/store';
import Sidebar from '@/components/chat/Sidebar';
import CallScreen from '@/components/call/CallScreen';
import { CALL_PREFIX, CallSignal, callManager } from '@/lib/webrtc/call-manager';
import { getCachedPeer } from '@/lib/telegram/peer-cache';

export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { activeCall, incomingCall, setIncomingCall, setActiveCall, dialogs } = useAppStore();
  const listenerRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
  }, [router]);

  // ── Telegram Update Listener — kiruvchi qo'ng'iroqlar ──
  useEffect(() => {
    if (listenerRef.current) return;
    listenerRef.current = true;

    let removeHandler: (() => void) | null = null;

    async function setupListener() {
      try {
        const { getTelegramClient } = await import('@/lib/telegram/client');
        const { NewMessage }        = await import('telegram/events');
        const client = await getTelegramClient();

        const handler = async (event: any) => {
          try {
            const msg = event?.message;
            if (!msg || msg.out) return; // O'zim yuborgan xabarni o'tkazib yuborish

            const text = msg.message || '';
            if (!text.startsWith(CALL_PREFIX)) return;

            const signal = CallSignal_parse(text);
            if (!signal) return;

            const fromId = (msg.fromId?.userId ?? msg.peerId?.userId)?.toString();
            if (!fromId) return;

            // Call signal ishlov berish
            if (signal.type === 'offer') {
              // Kiruvchi qo'ng'iroq
              if (activeCall || incomingCall) {
                // Allaqachon qo'ng'iroqda — rad etish
                callManager.callId  = signal.callId;
                callManager.peerId  = fromId;
                callManager.peerType = 'user';
                await callManager.rejectCall();
                return;
              }

              const cached = getCachedPeer(fromId);
              const peerName =
                cached?.name ||
                signal.callerName ||
                dialogs.find(d => d.id === fromId)?.name ||
                'Noma\'lum';

              setIncomingCall({
                callId: signal.callId,
                peerId: fromId,
                peerName,
                isVideo: signal.video || false,
                signal,
              });
            } else if (signal.type === 'answer' || signal.type === 'ice') {
              await callManager.handleSignal(signal);

              if (signal.type === 'answer') {
                // Update active call status to active
                setActiveCall(prev =>
                  prev ? { ...prev, status: 'active' } : null
                );
              }
            } else if (signal.type === 'end' || signal.type === 'reject') {
              await callManager.handleSignal(signal);
              setIncomingCall(null);
              setActiveCall(null);
            }
          } catch (e) {
            console.warn('[Layout] Update handler error:', e);
          }
        };

        client.addEventHandler(handler, new NewMessage({}));

        removeHandler = () => {
          client.removeEventHandler(handler, new NewMessage({}));
        };
      } catch (e) {
        console.warn('[Layout] Could not setup update listener:', e);
      }
    }

    setupListener();

    return () => {
      removeHandler?.();
      listenerRef.current = false;
    };
  }, []); // eslint-disable-line

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="chat-area">
        {children}
      </main>
      {(activeCall || incomingCall) && <CallScreen />}
    </div>
  );
}

// ── Helper ─────────────────────────────────────────────────
function CallSignal_parse(text: string): CallSignal | null {
  if (!text.startsWith(CALL_PREFIX)) return null;
  try { return JSON.parse(text.slice(CALL_PREFIX.length)); }
  catch { return null; }
}

// TypeScript helper — setActiveCall partial update
declare module '@/lib/store' {
  interface AppState {
    setActiveCall: (call: any) => void;
  }
}
