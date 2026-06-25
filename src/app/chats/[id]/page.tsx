'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { getMessages, sendMessage, Message } from '@/lib/telegram/messages';
import { markAsRead } from '@/lib/telegram/messages';

const AVATAR_GRADIENTS = [
  'avatar-gradient-1', 'avatar-gradient-2', 'avatar-gradient-3',
  'avatar-gradient-4', 'avatar-gradient-5', 'avatar-gradient-6',
];

function getAvatarGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash) + id.charCodeAt(i);
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
}

function formatMsgTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}

function formatDateHeader(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000 && d.getDate() === now.getDate()) return 'Bugun';
  if (diff < 172800000) return 'Kecha';
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });
}

function groupMessagesByDate(messages: Message[]): Array<{ date: string; msgs: Message[] }> {
  const groups: Record<string, Message[]> = {};
  for (const msg of messages) {
    const key = formatDateHeader(msg.date);
    if (!groups[key]) groups[key] = [];
    groups[key].push(msg);
  }
  return Object.entries(groups).map(([date, msgs]) => ({ date, msgs }));
}

export default function ChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { messages, setMessages, addMessage, activeChatName, setActiveCall, setSidebarOpen } = useAppStore();

  const chatId = params.id as string;
  const peerType = (searchParams.get('type') || 'user') as 'user' | 'group' | 'channel';
  const chatName = activeChatName || 'Suhbat';

  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isOnline, setIsOnline] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatMessages = messages[chatId] || [];

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMessages(chatId, peerType, 50);
      setMessages(chatId, data);
      if (data.length > 0) {
        await markAsRead(chatId, peerType, data[data.length - 1].id);
      }
    } catch (e) {
      console.error('Failed to load messages:', e);
    } finally {
      setLoading(false);
    }
  }, [chatId, peerType, setMessages]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  async function handleSend() {
    if (!text.trim() || sending) return;
    const msgText = text.trim();
    setText('');
    setSending(true);

    // Optimistic UI
    const tempMsg: Message = {
      id: Date.now(),
      text: msgText,
      date: Math.floor(Date.now() / 1000),
      isOutgoing: true,
      isRead: false,
    };
    addMessage(chatId, tempMsg);

    try {
      await sendMessage(chatId, peerType, msgText);
    } catch (e) {
      console.error('Send failed:', e);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleVoiceCall() {
    setActiveCall({ peerId: chatId, peerName: chatName, type: 'voice', status: 'calling' });
  }

  function handleVideoCall() {
    setActiveCall({ peerId: chatId, peerName: chatName, type: 'video', status: 'calling' });
  }

  const grouped = groupMessagesByDate(chatMessages);
  const gradient = getAvatarGradient(chatId);
  const initials = getInitials(chatName);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Chat Header */}
      <div className="chat-header">
        {/* Back button (mobile) */}
        <button
          className="icon-btn"
          onClick={() => {
            setSidebarOpen(true);
            router.push('/chats');
          }}
          style={{ display: 'none' }}
          id="back-btn"
        >
          <ArrowLeftIcon />
        </button>

        <div className={`dialog-avatar ${gradient}`} style={{ width: 40, height: 40, fontSize: 15, cursor: 'pointer' }}>
          {initials}
        </div>

        <div className="chat-header-info">
          <div className="chat-header-name">{chatName}</div>
          <div className={`chat-header-status ${isOnline ? '' : 'offline'}`}>
            {isOnline ? 'online' : peerType === 'group' ? 'guruh' : peerType === 'channel' ? 'kanal' : 'oxirgi marta ko\'rilgan'}
          </div>
        </div>

        <button className="icon-btn" onClick={handleVoiceCall} title="Ovozli qo'ng'iroq">
          <PhoneIcon />
        </button>
        <button className="icon-btn" onClick={handleVideoCall} title="Video qo'ng'iroq">
          <VideoIcon />
        </button>
        <button className="icon-btn" title="Ko'proq">
          <MoreIcon />
        </button>
      </div>

      {/* Messages */}
      <div className="messages-area">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
            <div className="spinner" />
          </div>
        ) : chatMessages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 20px' }}>
            <p>Hali xabar yo'q. Salom yozing! 👋</p>
          </div>
        ) : (
          grouped.map(({ date, msgs }) => (
            <div key={date} className="message-group">
              <div className="date-divider"><span>{date}</span></div>
              {msgs.map((msg, i) => (
                <MessageBubble key={msg.id} msg={msg} prevMsg={msgs[i - 1]} />
              ))}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <div className="input-area">
        <div className="input-actions-left">
          <button className="icon-btn" title="Emoji">
            <EmojiIcon />
          </button>
        </div>

        <div className="input-field-wrap">
          <textarea
            ref={inputRef}
            className="message-input"
            placeholder="Xabar yozing..."
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            rows={1}
          />
        </div>

        <div className="input-actions-right">
          {text.trim() ? (
            <button className="send-btn" onClick={handleSend} disabled={sending}>
              {sending ? <div className="spinner" style={{ width: 18, height: 18, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} /> : <SendIcon />}
            </button>
          ) : (
            <>
              <button className="icon-btn" title="Fayl">
                <AttachIcon />
              </button>
              <button className="icon-btn" title="Mikrofon">
                <MicIcon />
              </button>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 768px) {
          #back-btn { display: flex !important; }
        }
      `}</style>
    </div>
  );
}

function MessageBubble({ msg, prevMsg }: { msg: Message; prevMsg?: Message }) {
  const isOut = msg.isOutgoing;
  const time = formatMsgTime(msg.date);

  const showAvatar = !isOut && (!prevMsg || prevMsg.isOutgoing);

  return (
    <div className={`message-row ${isOut ? 'out' : 'in'}`}>
      <div className="message-bubble">
        {msg.media && (
          <div style={{ marginBottom: 4, color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            {msg.media.type === 'photo' ? '📷 Rasm' :
              msg.media.type === 'video' ? '🎥 Video' :
              msg.media.type === 'audio' ? '🎵 Audio' :
              '📎 Fayl'}
          </div>
        )}
        {msg.text && <p className="message-text">{msg.text}</p>}
        <div className="message-meta">
          {msg.editDate && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginRight: 2 }}>tahrirlangan</span>
          )}
          <span className="message-time">{time}</span>
          {isOut && (
            <span className={`message-status ${msg.isRead ? 'read' : 'sent'}`}>
              {msg.isRead ? <DoubleCheckIcon /> : <SingleCheckIcon />}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Icons
function ArrowLeftIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>;
}
function PhoneIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.72a16 16 0 0 0 6.37 6.37l1.79-1.79a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>;
}
function VideoIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>;
}
function MoreIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>;
}
function EmojiIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>;
}
function AttachIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>;
}
function MicIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>;
}
function SendIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>;
}
function DoubleCheckIcon() {
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
      <path d="M0 6l4 4L12 2" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M4 6l4 4L16 2" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );
}
function SingleCheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="1 6 4 9 11 2" />
    </svg>
  );
}
