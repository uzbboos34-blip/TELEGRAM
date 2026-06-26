'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { getMessages, sendMessage, markAsRead, Message } from '@/lib/telegram/messages';
import { getCachedPeer } from '@/lib/telegram/peer-cache';

// ── Helpers ────────────────────────────────────────────────
const GRADIENTS = [
  'avatar-gradient-1','avatar-gradient-2','avatar-gradient-3',
  'avatar-gradient-4','avatar-gradient-5','avatar-gradient-6',
  'avatar-gradient-7','avatar-gradient-8',
];
function getGrad(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i);
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}
function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}
function fmtTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}
function fmtDateHdr(ts: number) {
  const d = new Date(ts * 1000);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000 && d.getDate() === now.getDate()) return 'Bugun';
  if (diff < 172800000) return 'Kecha';
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long' });
}
function groupByDate(messages: Message[]) {
  const g: Record<string, Message[]> = {};
  for (const m of messages) {
    const k = fmtDateHdr(m.date);
    if (!g[k]) g[k] = [];
    g[k].push(m);
  }
  return Object.entries(g).map(([date, msgs]) => ({ date, msgs }));
}
function mediaLabel(media?: Message['media']): string {
  if (!media) return '';
  const icons: Record<string, string> = {
    photo: '📷 Rasm', video: '🎥 Video', audio: '🎵 Audio',
    voice: '🎙️ Ovozli', document: '📎 Fayl', sticker: '🎭 Sticker', gif: '🎞️ GIF',
  };
  return icons[media.type] || '📎 Media';
}

// ─────────────────────────────────────────────────────────────
export default function ChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    messages, setMessages, addMessage,
    activeChatName, setActiveCall, setSidebarOpen,
  } = useAppStore();

  const chatId    = params.id as string;
  const peerType  = (searchParams.get('type') || 'user') as 'user' | 'group' | 'channel';
  const peer      = getCachedPeer(chatId);
  const chatName  = activeChatName || peer?.name || 'Suhbat';

  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError]     = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const chatMsgs  = messages[chatId] || [];

  // ── Load messages ──────────────────────────────────────
  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getMessages(chatId, peerType, 50);
      setMessages(chatId, data);
      if (data.length > 0) {
        await markAsRead(chatId, peerType, data[data.length - 1].id);
      }
    } catch (e: any) {
      setError(e?.message || 'Xabarlar yuklanmadi');
    } finally {
      setLoading(false);
    }
  }, [chatId, peerType, setMessages]);

  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMsgs.length]);

  // ── Send ───────────────────────────────────────────────
  async function handleSend() {
    const msg = text.trim();
    if (!msg || sending) return;
    setText('');
    setSending(true);

    const tempMsg: Message = {
      id: Date.now(), text: msg,
      date: Math.floor(Date.now() / 1000),
      isOutgoing: true, isRead: false,
    };
    addMessage(chatId, tempMsg);

    try {
      await sendMessage(chatId, peerType, msg);
    } catch (e: any) {
      setError('Xabar yuborilmadi: ' + (e?.message || ''));
    } finally {
      setSending(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  // ── Calls ─────────────────────────────────────────────
  function startVoiceCall() {
    setActiveCall({ peerId: chatId, peerName: chatName, type: 'voice', status: 'calling' });
  }
  function startVideoCall() {
    setActiveCall({ peerId: chatId, peerName: chatName, type: 'video', status: 'calling' });
  }

  const grad = getGrad(chatId);
  const ini  = initials(chatName);
  const grouped = groupByDate(chatMsgs);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

      {/* ── Chat Header ───────────────────────────── */}
      <div className="chat-header">
        <button className="icon-btn" id="back-btn"
          onClick={() => { setSidebarOpen(true); router.push('/chats'); }}>
          <ArrowIcon />
        </button>

        <div className={`dialog-avatar ${grad}`}
          style={{ width:40, height:40, fontSize:15, cursor:'pointer' }}>
          {peerType === 'channel' ? '📢' : peerType === 'group' ? '👥' : peer?.isBot ? '🤖' : ini}
        </div>

        <div className="chat-header-info">
          <div className="chat-header-name">{chatName}</div>
          <div className={`chat-header-status ${peer?.isOnline ? '' : 'offline'}`}>
            {peer?.isOnline ? '● online'
              : peerType === 'group' ? 'guruh'
              : peerType === 'channel' ? 'kanal'
              : 'so\'nggi marta ko\'rilgan'}
          </div>
        </div>

        {/* Calls — faqat user va group uchun */}
        {peerType !== 'channel' && (
          <>
            <button className="icon-btn" title="Ovozli qo'ng'iroq" onClick={startVoiceCall}>
              <PhoneIcon />
            </button>
            <button className="icon-btn" title="Video qo'ng'iroq" onClick={startVideoCall}>
              <VideoIcon />
            </button>
          </>
        )}
        <button className="icon-btn"><MoreIcon /></button>
      </div>

      {/* ── Messages ─────────────────────────────── */}
      <div className="messages-area">
        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:40 }}>
            <div className="spinner" />
          </div>
        ) : error ? (
          <div style={{
            textAlign:'center', padding:'40px 20px',
            color:'var(--text-secondary)',
          }}>
            <p style={{ fontSize:32, marginBottom:12 }}>⚠️</p>
            <p style={{ marginBottom:8 }}>{error}</p>
            <button className="btn btn-ghost" style={{ width:'auto', padding:'10px 20px' }}
              onClick={loadMessages}>
              Qayta urinish
            </button>
          </div>
        ) : chatMsgs.length === 0 ? (
          <div style={{ textAlign:'center', color:'var(--text-secondary)', padding:'60px 20px' }}>
            <p style={{ fontSize:40, marginBottom:12 }}>👋</p>
            <p>Hali xabar yo&apos;q. Salom yozing!</p>
          </div>
        ) : (
          grouped.map(({ date, msgs }) => (
            <div key={date} className="message-group">
              <div className="date-divider"><span>{date}</span></div>
              {msgs.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Error toast ────────────────────────── */}
      {error && !loading && chatMsgs.length > 0 && (
        <div style={{
          margin:'0 16px 8px',
          padding:'8px 16px',
          background:'rgba(229,57,53,0.12)',
          border:'1px solid rgba(229,57,53,0.3)',
          borderRadius:'var(--radius-md)',
          color:'var(--error)',
          fontSize:'var(--font-size-sm)',
        }}>
          {error}
        </div>
      )}

      {/* ── Input Area ────────────────────────── */}
      <div className="input-area">
        <div className="input-actions-left">
          <button className="icon-btn"><EmojiIcon /></button>
        </div>

        <div className="input-field-wrap">
          <textarea
            ref={inputRef}
            className="message-input"
            placeholder="Xabar yozing..."
            value={text}
            rows={1}
            onChange={e => {
              setText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKey}
          />
        </div>

        <div className="input-actions-right">
          {text.trim() ? (
            <button className="send-btn" onClick={handleSend} disabled={sending}>
              {sending
                ? <div className="spinner" style={{ width:18, height:18, borderWidth:2, borderColor:'rgba(255,255,255,.3)', borderTopColor:'white' }} />
                : <SendIcon />}
            </button>
          ) : (
            <>
              <button className="icon-btn"><AttachIcon /></button>
              <button className="icon-btn"><MicIcon /></button>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 768px) { #back-btn { display:flex !important; } }
        #back-btn { display:none; }
      `}</style>
    </div>
  );
}

// ── Message Bubble ─────────────────────────────────────────
function MessageBubble({ msg }: { msg: Message }) {
  const time = fmtTime(msg.date);
  const label = mediaLabel(msg.media);

  return (
    <div className={`message-row ${msg.isOutgoing ? 'out' : 'in'}`}>
      <div className="message-bubble">
        {label && (
          <div style={{
            fontSize:'var(--font-size-sm)',
            color: msg.isOutgoing ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)',
            marginBottom: msg.text ? 4 : 0,
            display:'flex', alignItems:'center', gap:4,
          }}>
            {label}
          </div>
        )}
        {msg.text && <p className="message-text">{msg.text}</p>}
        <div className="message-meta">
          {msg.editDate && (
            <span style={{ fontSize:10, color:'rgba(255,255,255,.4)', marginRight:2 }}>
              tahrirlangan
            </span>
          )}
          <span className="message-time">{time}</span>
          {msg.isOutgoing && (
            <span className={`message-status ${msg.isRead ? 'read' : 'sent'}`}>
              {msg.isRead ? <DblCheckIcon /> : <CheckIcon />}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────
function ArrowIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>; }
function PhoneIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.72a16 16 0 0 0 6.37 6.37l1.79-1.79a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>; }
function VideoIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>; }
function MoreIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>; }
function EmojiIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>; }
function AttachIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>; }
function MicIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>; }
function SendIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>; }
function CheckIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>; }
function DblCheckIcon() { return <svg width="18" height="12" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 6 5 10 13 2"/><polyline points="7 6 11 10 17 2"/></svg>; }
