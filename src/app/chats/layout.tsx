'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getCurrentUser } from '@/lib/telegram/auth';
import { useAppStore } from '@/lib/store';
import Sidebar from '@/components/chat/Sidebar';
import CallScreen from '@/components/call/CallScreen';
import { callManager } from '@/lib/webrtc/call-manager';
import { type SignalPayload as CallSignal } from '@/lib/telegram/call-signaling';
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
        const { setupSignalHandler } = await import('@/lib/telegram/call-signaling');
        const client = await getTelegramClient();

        // Phone API orqali signaling (UpdatePhoneCall)
        setupSignalHandler((peerId, payload) => {
          handleIncomingSignal(peerId, payload);
        });

        const { Raw } = await import('telegram/events');

        const handler = async (update: any) => {
          try {
            const className = update.className || update.constructor?.name;
            if (!className) return;

            if (className === 'UpdateNewMessage' || className === 'UpdateNewChannelMessage') {
              const msg = update.message;
              if (!msg) return;

              const { parseRawMessage } = await import('@/lib/telegram/messages');
              const parsed = parseRawMessage(msg);

              const targetChatId = (
                msg.peerId?.userId ??
                msg.peerId?.chatId ??
                msg.peerId?.channelId ??
                msg.fromId?.userId
              )?.toString();

              if (!targetChatId) return;

              const state = useAppStore.getState();
              if (state.activeChatId === targetChatId) {
                const currentMsgs = state.messages[targetChatId] || [];
                if (!currentMsgs.some(m => m.id === parsed.id)) {
                  state.addMessage(targetChatId, parsed);
                }
              }

              const updatedDialogs = state.dialogs.map(d => {
                if (d.id === targetChatId) {
                  return {
                    ...d,
                    lastMessage: parsed.text || (parsed.media ? '📎 Media' : ''),
                    lastMessageDate: parsed.date,
                    unreadCount: !parsed.isOutgoing ? d.unreadCount + 1 : d.unreadCount,
                  };
                }
                return d;
              });
              state.setDialogs(updatedDialogs);
            }
          } catch (e) {
            console.warn('[Layout] Raw update handler error:', e);
          }
        };

        client.addEventHandler(handler, new Raw({}));

        removeHandler = () => {
          client.removeEventHandler(handler, new Raw({}));
        };
      } catch (e) {
        console.warn('[Layout] Could not setup update listener:', e);
      }
    }

    function handleIncomingSignal(peerId: string, signal: CallSignal) {
      if (signal.type === 'offer') {
        const state = useAppStore.getState();
        if (state.activeCall || state.incomingCall) {
          callManager.callId = signal.callId;
          callManager.peerId = peerId;
          callManager.peerType = 'user';
          callManager.rejectCall();
          return;
        }

        const cached = getCachedPeer(peerId);
        const peerName = cached?.name || signal.callerName || "Noma'lum";
        useAppStore.getState().setIncomingCall({
          callId: signal.callId,
          peerId,
          peerName,
          isVideo: signal.video || false,
          signal,
        });
      } else if (signal.type === 'answer' || signal.type === 'ice') {
        callManager.handleSignal(signal);
        if (signal.type === 'answer') {
          const current = useAppStore.getState().activeCall;
          if (current) useAppStore.getState().setActiveCall({ ...current, status: 'active' });
        }
      } else if (signal.type === 'end' || signal.type === 'reject') {
        callManager.handleSignal(signal);
        useAppStore.getState().setIncomingCall(null);
        useAppStore.getState().setActiveCall(null);
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

// TypeScript helper — setActiveCall partial update
declare module '@/lib/store' {
  interface AppState {
    setActiveCall: (call: any) => void;
  }
}