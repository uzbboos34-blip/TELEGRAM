'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/telegram/auth';
import { useAppStore } from '@/lib/store';
import Sidebar from '@/components/chat/Sidebar';
import CallScreen from '@/components/call/CallScreen';
import { phoneCallManager } from '@/lib/webrtc/call-manager';

export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { activeCall, incomingCall, setIncomingCall, setActiveCall, dialogs } = useAppStore();
  const listenerRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }

    // ── VoIP Update Listener (Background) ─────────────────
    phoneCallManager.init();

    phoneCallManager.onIncomingCall = (info) => {
      setIncomingCall({
        callId: info.callId,
        accessHash: info.accessHash,
        peerId: info.adminId.toString(),
        peerName: info.peerName,
        gAHash: info.gAHash,
        isVideo: info.isVideo,
        adminId: info.adminId,
        participantId: info.participantId,
      });
    };

    phoneCallManager.onCallActive = (stream) => {
      const currentCall = useAppStore.getState().activeCall;
      if (currentCall) {
        setActiveCall({
          ...currentCall,
          status: 'active',
        });
      }
    };

    phoneCallManager.onCallEnded = () => {
      setActiveCall(null);
      setIncomingCall(null);
    };

    return () => {
      phoneCallManager.destroy();
    };
  }, [router, setIncomingCall, setActiveCall]);

  // ── Telegram Update Listener — xabarlar ──────────────
  useEffect(() => {
    if (listenerRef.current) return;
    listenerRef.current = true;

    let removeHandler: (() => void) | null = null;

    async function setupListener() {
      try {
        const { getTelegramClient } = await import('@/lib/telegram/client');
        const client = await getTelegramClient();
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
        removeHandler = () => client.removeEventHandler(handler, new Raw({}));
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

  const { activeChatId } = useAppStore();

  return (
    <div className={`app-layout ${activeChatId ? 'has-active-chat' : 'no-active-chat'}`}>
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