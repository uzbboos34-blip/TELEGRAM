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
        const { Raw }               = await import('telegram/events');
        const client = await getTelegramClient();

        const handler = async (update: any) => {
          try {
            const className = update.className || update.constructor?.name;
            if (!className) return;

            // 1. Yangi xabar kelishi (kiruvchi va chiquvchi)
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

              // a. Agar xabar Call signal bo'lsa
              if (parsed.text.startsWith(CALL_PREFIX)) {
                if (parsed.isOutgoing) return; // O'zim yuborgan call signal

                const signal = CallSignal_parse(parsed.text);
                if (!signal) return;

                if (signal.type === 'offer') {
                  const state = useAppStore.getState();
                  if (state.activeCall || state.incomingCall) {
                    callManager.callId = signal.callId;
                    callManager.peerId = targetChatId;
                    callManager.peerType = 'user';
                    await callManager.rejectCall();
                    return;
                  }

                  const cached = getCachedPeer(targetChatId);
                  const peerName = cached?.name || signal.callerName || 'Noma\'lum';
                  useAppStore.getState().setIncomingCall({
                    callId: signal.callId,
                    peerId: targetChatId,
                    peerName,
                    isVideo: signal.video || false,
                    signal,
                  });
                } else if (signal.type === 'answer' || signal.type === 'ice') {
                  await callManager.handleSignal(signal);
                  if (signal.type === 'answer') {
                    const current = useAppStore.getState().activeCall;
                    if (current) useAppStore.getState().setActiveCall({ ...current, status: 'active' });
                  }
                } else if (signal.type === 'end' || signal.type === 'reject') {
                  await callManager.handleSignal(signal);
                  useAppStore.getState().setIncomingCall(null);
                  useAppStore.getState().setActiveCall(null);
                }
                return; // Ovozli/video qo'ng'iroq signal xabari yashiriladi
              }

              // b. Oddiy xabarlarni do'konga qo'shish va dialoglarni yangilash
              const state = useAppStore.getState();

              if (state.activeChatId === targetChatId) {
                const currentMsgs = state.messages[targetChatId] || [];
                if (!currentMsgs.some(m => m.id === parsed.id)) {
                  state.addMessage(targetChatId, parsed);
                }
              }

              // Dialogs ro'yxatini yangilash
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

            // 2. Chat tarixining boshqa odam tomonidan o'qilishi (double-tick real-time)
            else if (className === 'UpdateReadHistoryOutbox' || className === 'UpdateReadChannelOutbox') {
              const peerId = (update.peer?.userId ?? update.channelId)?.toString();
              const maxId = update.maxId;
              if (!peerId || !maxId) return;

              const state = useAppStore.getState();
              const chatMsgs = state.messages[peerId] || [];
              if (chatMsgs.length > 0) {
                const updated = chatMsgs.map(m => {
                  if (m.isOutgoing && m.id <= maxId && !m.isRead) {
                    return { ...m, isRead: true };
                  }
                  return m;
                });
                state.setMessages(peerId, updated);
              }
            }

            // 3. User onlayn/offlayn holati o'zgarishi
            else if (className === 'UpdateUserStatus') {
              const userId = update.userId?.toString();
              const status = update.status;
              if (!userId || !status) return;

              const { parseUserStatus, cachePeer, getCachedPeer } = await import('@/lib/telegram/peer-cache');
              const { isOnline, text: statusText } = parseUserStatus(status);

              const cached = getCachedPeer(userId);
              if (cached) {
                cachePeer(userId, { ...cached, isOnline, statusText });

                const state = useAppStore.getState();
                const updatedDialogs = state.dialogs.map(d => {
                  if (d.id === userId) {
                    return { ...d, online: isOnline, statusText };
                  }
                  return d;
                });
                state.setDialogs(updatedDialogs);
              }
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
