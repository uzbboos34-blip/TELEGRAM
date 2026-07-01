'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { getMessages, sendMessage, markAsRead, Message } from '@/lib/telegram/messages';
import { downloadMessagePhoto, downloadProfilePhoto } from '@/lib/telegram/media';
import { getCachedPeer, cachePeer } from '@/lib/telegram/peer-cache';
import TelegramAvatar from '@/components/chat/TelegramAvatar';

const GRADS = ['avatar-gradient-1','avatar-gradient-2','avatar-gradient-3',
               'avatar-gradient-4','avatar-gradient-5','avatar-gradient-6',
               'avatar-gradient-7','avatar-gradient-8'];
function getGrad(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i);
  return GRADS[Math.abs(h) % GRADS.length];
}
function initials(n: string) {
  return n.split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';
}
function fmtTime(ts: number) {
  return new Date(ts*1000).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'});
}
function fmtDateHdr(ts: number) {
  const d=new Date(ts*1000), now=new Date();
  const diff = now.getTime()-d.getTime();
  if (diff<86400000 && d.getDate()===now.getDate()) return 'Bugun';
  if (diff<172800000) return 'Kecha';
  return d.toLocaleDateString('ru',{day:'numeric',month:'long'});
}
function groupByDate(msgs: Message[]) {
  const g: Record<string,Message[]> = {};
  for (const m of msgs) {
    const k = fmtDateHdr(m.date);
    (g[k]||(g[k]=[])).push(m);
  }
  return Object.entries(g).map(([date,msgs])=>({date,msgs}));
}
function fmtSize(bytes: number) {
  if (bytes>1024*1024) return (bytes/1024/1024).toFixed(1)+' MB';
  if (bytes>1024) return (bytes/1024).toFixed(0)+' KB';
  return bytes+' B';
}
function fmtDur(sec?: number) {
  if (!sec) return '';
  const m=Math.floor(sec/60), s=sec%60;
  return `${m}:${s.toString().padStart(2,'0')}`;
}

export default function ChatPage() {
  const params       = useParams();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const {
    messages, setMessages, addMessage,
    activeChatName, setActiveCall, setSidebarOpen,
  } = useAppStore();

  const chatId   = params.id as string;
  const peerType = (searchParams.get('type')||'user') as 'user'|'group'|'channel';
  const peer     = getCachedPeer(chatId);
  const chatName = activeChatName || peer?.name || 'Suhbat';

  const [text, setText]       = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr]         = useState('');

  const [isRecording, setIsRecording] = useState(false);
  const [recDuration, setRecDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<NodeJS.Timeout | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatMsgs  = messages[chatId] || [];
  const grouped   = groupByDate(chatMsgs);

  // Replies & Reactions States
  const [replyMsg, setReplyMsg] = useState<Message | null>(null);
  const [localReactions, setLocalReactions] = useState<Record<number, string[]>>({});
  const [hoveredMessageId, setHoveredMessageId] = useState<number | null>(null);

  // Right Drawer Profile State
  const [infoOpen, setInfoOpen] = useState(false);
  const [largeAvatarUrl, setLargeAvatarUrl] = useState<string | null>(null);
  const [sharedMediaTab, setSharedMediaTab] = useState<'media' | 'docs' | 'links' | 'audio'>('media');

  useEffect(() => {
    if (infoOpen) {
      downloadProfilePhoto(chatId).then(url => {
        if (url) setLargeAvatarUrl(url);
      });
    }
  }, [infoOpen, chatId]);

  const sharedMediaItems = chatMsgs.filter(m => m.media?.type === 'photo' || m.media?.type === 'video');
  const sharedDocsItems = chatMsgs.filter(m => m.media?.type === 'document');
  const sharedAudioItems = chatMsgs.filter(m => m.media?.type === 'voice' || m.media?.type === 'audio');
  const sharedLinksItems = chatMsgs.filter(m => m.text && (m.text.includes('http://') || m.text.includes('https://')));

  // Voice recording triggers
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const options = { mimeType: 'audio/webm' };
      
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch {
        recorder = new MediaRecorder(stream);
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (audioChunksRef.current.length > 0 && recDuration > 0.5) {
          const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/ogg' });
          const duration = recDuration;
          
          setSending(true);
          const tmpId = Date.now();
          const tmp: Message = {
            id: tmpId,
            text: '',
            date: Math.floor(Date.now() / 1000),
            isOutgoing: true,
            isRead: false,
            media: { type: 'voice', duration }
          };
          addMessage(chatId, tmp);
          
          try {
            const { sendVoiceMessage } = await import('@/lib/telegram/media');
            await sendVoiceMessage(chatId, peerType, audioBlob, duration);
            const data = await getMessages(chatId, peerType, 50);
            setMessages(chatId, data);
          } catch (e: any) {
            setErr('Ovoz yozuvi yuborilmadi: ' + (e?.message || e));
          } finally {
            setSending(false);
          }
        }
        setRecDuration(0);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(200);
      setIsRecording(true);
      setRecDuration(0);

      recTimerRef.current = setInterval(() => {
        setRecDuration(d => d + 1);
      }, 1000);
    } catch (err: any) {
      setErr('Mikrofon ruxsati berilmadi: ' + (err?.message || err));
    }
  }

  function stopAndSendRecording() {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }

  function cancelRecording() {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    audioChunksRef.current = [];
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecDuration(0);
  }

  useEffect(() => {
    return () => { if (recTimerRef.current) clearInterval(recTimerRef.current); };
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSending(true);
    setErr('');

    try {
      const tmpId = Date.now();
      const tmp: Message = {
        id: tmpId,
        text: '',
        date: Math.floor(Date.now() / 1000),
        isOutgoing: true,
        isRead: false,
        media: {
          type: file.type.startsWith('image/') ? 'photo' : 'document',
          fileName: file.name,
          fileSize: file.size,
        }
      };
      addMessage(chatId, tmp);

      const buffer = await file.arrayBuffer();
      const { sendFileMessage } = await import('@/lib/telegram/media');
      await sendFileMessage(chatId, peerType, buffer, file.name, file.type);

      const data = await getMessages(chatId, peerType, 50);
      setMessages(chatId, data);
    } catch (e: any) {
      setErr('Fayl yuborilmadi: ' + (e?.message || e));
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const data = await getMessages(chatId, peerType, 50);
      setMessages(chatId, data);
      if (data.length) markAsRead(chatId, peerType, data[data.length-1].id);
    } catch(e:any) { setErr(e?.message||'Xato'); }
    finally { setLoading(false); }
  }, [chatId, peerType, setMessages]);

  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:'smooth'}); }, [chatMsgs.length]);

  async function handleSend() {
    const msg = text.trim();
    if (!msg||sending) return;
    setText(''); setSending(true);

    const tmp: Message = {
      id: Date.now(),
      text: msg,
      date: Math.floor(Date.now()/1000),
      isOutgoing: true,
      isRead: false,
      replyToMsgId: replyMsg?.id
    };
    addMessage(chatId, tmp);
    const replyTargetId = replyMsg?.id;
    setReplyMsg(null);

    try {
      await sendMessage(chatId, peerType, msg, replyTargetId);
    } catch(e:any) {
      setErr('Yuborilmadi: '+(e?.message||''));
    } finally {
      setSending(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const scrollToMessage = (msgId: number) => {
    const element = document.getElementById(`msg-${msgId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.style.transition = 'background 0.5s';
      element.style.background = 'rgba(42, 171, 238, 0.25)';
      setTimeout(() => { element.style.background = ''; }, 1000);
    }
  };

  const toggleReaction = (messageId: number, emoji: string) => {
    setLocalReactions(prev => {
      const msgReactions = prev[messageId] || [];
      if (msgReactions.includes(emoji)) {
        return { ...prev, [messageId]: msgReactions.filter(e => e !== emoji) };
      } else {
        return { ...prev, [messageId]: [...msgReactions, emoji] };
      }
    });
    setHoveredMessageId(null);
  };

  return (
    <div className="chat-main-container">

      {/* ── A. Messages Area Stream Panel ── */}
      <div className="messages-stream-wrap">

        {/* Header */}
        <div className="chat-header">
          <button className="icon-btn" id="back-btn"
            onClick={()=>{ setSidebarOpen(true); router.push('/chats'); }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>

          <div onClick={() => setInfoOpen(!infoOpen)} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', flex: 1 }}>
            <TelegramAvatar id={chatId} name={chatName} type={peerType} isOnline={peer?.isOnline} size={40} />
            <div className="chat-header-info">
              <div className="chat-header-name">{chatName}</div>
              <div className={`chat-header-status ${peer?.isOnline ? 'online-status' : ''}`}>
                {peer?.isOnline
                  ? <><span style={{color:'#4CAF50',marginRight:3}}>●</span>online</>
                  : peerType === 'group'
                  ? (peer?.memberCount ? `${peer.memberCount.toLocaleString()} ta a'zo` : 'guruh')
                  : peerType === 'channel'
                  ? (peer?.memberCount ? `${peer.memberCount.toLocaleString()} obunachilar` : 'kanal')
                  : peer?.statusText || "oxirgi marta yaqinda ko'rilgan"}
              </div>
            </div>
          </div>

          {peerType !== 'channel' && <>
            <button className="icon-btn" title="Ovozli qo'ng'iroq"
              onClick={()=>setActiveCall({peerId:chatId,peerName:chatName,type:'voice',status:'calling'})}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.72a16 16 0 0 0 6.37 6.37l1.79-1.79a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </button>
            <button className="icon-btn" title="Video qo'ng'iroq"
              onClick={()=>setActiveCall({peerId:chatId,peerName:chatName,type:'video',status:'calling'})}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </svg>
            </button>
          </>}
          
          <button className="icon-btn" onClick={() => setInfoOpen(!infoOpen)} title="Chat ma'lumotlari">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
            </svg>
          </button>
        </div>

        {/* Guruhdagi qadalgan xabar (Pinned Message Banner - Screenshot 6) */}
        {peerType === 'group' && (
          <div className="pinned-message-banner" onClick={() => {
            if (chatMsgs.length > 0) scrollToMessage(chatMsgs[0].id);
          }}>
            <div className="pinned-banner-content">
              <div className="pinned-banner-title">Qadalgan xabar</div>
              <div className="pinned-banner-text">Rasman ertaga oxrigi dars ekan</div>
            </div>
            <div className="pinned-banner-close" style={{ color: 'var(--text-secondary)' }}>📌</div>
          </div>
        )}

        {/* Messages Stream */}
        <div className="messages-area">
          {loading ? (
            <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100%'}}>
              <div className="spinner"/>
            </div>
          ) : err && chatMsgs.length===0 ? (
            <div style={{textAlign:'center',padding:'60px 20px',color:'var(--text-secondary)'}}>
              <p style={{fontSize:32,marginBottom:12}}>⚠️</p>
              <p style={{marginBottom:16}}>{err}</p>
              <button className="btn btn-primary" style={{width:'auto',padding:'10px 24px'}} onClick={load}>Qayta urinish</button>
            </div>
          ) : chatMsgs.length===0 ? (
            <div style={{textAlign:'center',color:'var(--text-secondary)',padding:'80px 20px'}}>
              <p style={{fontSize:40,marginBottom:12}}>👋</p>
              <p>Hali xabar yo&apos;q. Salom yozing!</p>
            </div>
          ) : (
            grouped.map(({date,msgs})=>(
              <div key={date} className="message-group">
                <div className="date-divider"><span>{date}</span></div>
                {msgs.map(msg=>(
                  <div key={msg.id} id={`msg-${msg.id}`}
                    onMouseEnter={() => setHoveredMessageId(msg.id)}
                    onMouseLeave={() => setHoveredMessageId(null)}
                    style={{ position: 'relative' }}>
                    
                    {/* Hover Reaction menu pill */}
                    {hoveredMessageId === msg.id && (
                      <div className="hover-reactions-menu">
                        {['👍', '❤️', '🔥', '👏', '😂'].map(emoji => (
                          <button key={emoji} className="reaction-emoji-btn" onClick={() => toggleReaction(msg.id, emoji)}>
                            {emoji}
                          </button>
                        ))}
                        <button className="reaction-emoji-btn" onClick={() => setReplyMsg(msg)} title="Javob berish" style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 4, marginLeft: 4 }}>
                          ↩️
                        </button>
                      </div>
                    )}

                    {/* Guruhda xabar egasini bilish uchun kiruvchi xabarlar chapida doiraviy rasm */}
                    <div className={`message-row ${msg.isOutgoing ? 'out' : 'in'}`}>
                      {peerType === 'group' && !msg.isOutgoing && (
                        <div style={{ alignSelf: 'flex-end', marginBottom: 2, marginRight: 2, flexShrink: 0 }}>
                          <TelegramAvatar id={msg.fromId || chatId} name={msg.senderName || 'Azo'} type="user" size={32} />
                        </div>
                      )}
                      
                      <MessageBubble msg={msg} chatId={chatId} peerType={peerType} chatName={chatName} onScrollTo={scrollToMessage} />
                    </div>

                    {localReactions[msg.id] && localReactions[msg.id].length > 0 && (
                      <div className="message-reactions-list">
                        {localReactions[msg.id].map((emoji, idx) => (
                          <div key={idx} className="reaction-pill" onClick={() => toggleReaction(msg.id, emoji)}>
                            <span>{emoji}</span>
                            <span style={{ fontSize: 9, opacity: 0.8 }}>1</span>
                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                ))}
              </div>
            ))
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Reply Bar Preview */}
        {replyMsg && (
          <div className="reply-bar-preview">
            <div className="reply-bar-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
                <polyline points="12 17 9 20 6 17" />
              </svg>
            </div>
            <div className="reply-bar-content">
              <span className="reply-bar-name">{replyMsg.senderName || (replyMsg.isOutgoing ? 'Siz' : chatName)}</span>
              <span className="reply-bar-text">{replyMsg.text || (replyMsg.media ? `[${replyMsg.media.type === 'photo' ? 'Rasm' : 'Fayl'}]` : 'Xabar')}</span>
            </div>
            <div className="reply-bar-close" onClick={() => setReplyMsg(null)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </div>
          </div>
        )}

        {/* ── Floating Capsule Input Bar ────────────────── */}
        <div className="input-area">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          {isRecording ? (
            <div className="input-field-wrap-capsule" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="recording-dot" style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--error)', display: 'inline-block', animation: 'pulse 1.2s infinite ease-in-out' }}/>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Ovoz yozilmoqda: <strong>{fmtDur(recDuration)}</strong>
                </span>
              </div>
              <button className="icon-btn" onClick={cancelRecording} title="Bekor qilish" style={{ color: 'var(--error)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          ) : (
            <div className="input-field-wrap-capsule">
              <button className="icon-btn" style={{ marginRight: 8 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
                </svg>
              </button>

              <textarea ref={inputRef} className="message-input"
                placeholder="Xabar" value={text} rows={1}
                style={{ background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: 15, width: '100%', resize: 'none', maxHeight: 120 }}
                onChange={e=>{
                  setText(e.target.value);
                  e.target.style.height='auto';
                  e.target.style.height=Math.min(e.target.scrollHeight,120)+'px';
                }}
                onKeyDown={handleKey}
              />

              <button className="icon-btn" onClick={() => fileInputRef.current?.click()} title="Fayl biriktirish" style={{ marginLeft: 8 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              </button>
            </div>
          )}

          {/* Circle active action button */}
          {text.trim() ? (
            <button className="input-send-circle-btn" onClick={handleSend} disabled={sending}>
              {sending
                ? <div className="spinner" style={{width:18,height:18,borderWidth:2,borderColor:'rgba(255,255,255,.3)',borderTopColor:'white'}}/>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              }
            </button>
          ) : (
            <button className="input-send-circle-btn" onClick={isRecording ? stopAndSendRecording : startRecording}>
              {isRecording ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              ) : (
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              )}
            </button>
          )}
        </div>

      </div>

      {/* ── B. Right Profile / Info Drawer ── */}
      {infoOpen && (
        <aside className={`profile-info-drawer ${infoOpen ? 'open' : ''}`}>
          <div className="drawer-header">
            <span className="drawer-title">Chat ma&apos;lumotlari</span>
            <button className="icon-btn" onClick={() => setInfoOpen(false)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          <div className="drawer-content">
            <div className="drawer-hero">
              <div className="drawer-hero-avatar">
                {largeAvatarUrl ? <img src={largeAvatarUrl} alt={chatName} /> : initials(chatName)}
              </div>
              <span className="drawer-hero-name">{chatName}</span>
              <span className={`drawer-hero-status ${peer?.isOnline ? 'online' : ''}`}>
                {peer?.isOnline ? 'online' : peer?.statusText || "oxirgi marta yaqinda ko'rilgan"}
              </span>
            </div>

            <div className="drawer-details-list">
              {peer?.id && (
                <div className="drawer-detail-item">
                  <div className="drawer-detail-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72" /></svg>
                  </div>
                  <div>
                    <div className="drawer-detail-value">{peerIdToMockPhone(chatId)}</div>
                    <div className="drawer-detail-label">Telefon</div>
                  </div>
                </div>
              )}

              <div className="drawer-detail-item">
                <div className="drawer-detail-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" /></svg>
                </div>
                <div>
                  <div className="drawer-detail-value">@{chatName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'username'}</div>
                  <div className="drawer-detail-label">Username</div>
                </div>
              </div>

              <div className="drawer-detail-item">
                <div className="drawer-detail-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                </div>
                <div>
                  <div className="drawer-detail-value">{peerType === 'user' ? 'Mening rasmiy suhbatdosh profilim.' : 'Guruh yozishmalari.'}</div>
                  <div className="drawer-detail-label">Bio (Haqida)</div>
                </div>
              </div>
            </div>

            <div className="shared-media-section">
              <div className="shared-media-tabs">
                <button className={`shared-media-tab ${sharedMediaTab === 'media' ? 'active' : ''}`} onClick={() => setSharedMediaTab('media')}>Media</button>
                <button className={`shared-media-tab ${sharedMediaTab === 'docs' ? 'active' : ''}`} onClick={() => setSharedMediaTab('docs')}>Docs</button>
                <button className={`shared-media-tab ${sharedMediaTab === 'links' ? 'active' : ''}`} onClick={() => setSharedMediaTab('links')}>Links</button>
                <button className={`shared-media-tab ${sharedMediaTab === 'audio' ? 'active' : ''}`} onClick={() => setSharedMediaTab('audio')}>Audio</button>
              </div>

              {sharedMediaTab === 'media' && (
                <div className="shared-media-grid">
                  {sharedMediaItems.length === 0 ? (
                    <div style={{ gridColumn: 'span 3', padding: '24px 0', textAlign: 'center', fontSize: 11.5, color: 'var(--text-secondary)' }}>Rasmlar yo&apos;q</div>
                  ) : (
                    sharedMediaItems.map(m => (
                      <SharedMediaGridItem key={m.id} msg={m} chatId={chatId} onClick={() => scrollToMessage(m.id)} />
                    ))
                  )}
                </div>
              )}

              {sharedMediaTab === 'docs' && (
                <div className="shared-media-list">
                  {sharedDocsItems.length === 0 ? (
                    <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 11.5, color: 'var(--text-secondary)' }}>Fayllar yo&apos;q</div>
                  ) : (
                    sharedDocsItems.map(m => (
                      <div key={m.id} className="shared-media-item-row" onClick={() => scrollToMessage(m.id)}>
                        <div className="shared-media-doc-icon">📄</div>
                        <div className="shared-media-doc-info">
                          <span className="shared-media-doc-title">{m.media?.fileName || 'Hujjat'}</span>
                          <span className="shared-media-doc-sub">{m.media?.fileSize ? fmtSize(m.media.fileSize) : ''} • {new Date(m.date * 1000).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {sharedMediaTab === 'links' && (
                <div className="shared-media-list">
                  {sharedLinksItems.length === 0 ? (
                    <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 11.5, color: 'var(--text-secondary)' }}>Havolalar yo&apos;q</div>
                  ) : (
                    sharedLinksItems.map(m => {
                      const link = m.text.match(/(https?:\/\/[^\s]+)/)?.[0] || m.text;
                      return (
                        <div key={m.id} className="shared-media-item-row" onClick={() => scrollToMessage(m.id)}>
                          <div className="shared-media-doc-icon">🔗</div>
                          <div className="shared-media-doc-info">
                            <span className="shared-media-doc-title">{link}</span>
                            <span className="shared-media-doc-sub">{new Date(m.date * 1000).toLocaleDateString()}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {sharedMediaTab === 'audio' && (
                <div className="shared-media-list">
                  {sharedAudioItems.length === 0 ? (
                    <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 11.5, color: 'var(--text-secondary)' }}>Ovozli xabarlar yo&apos;q</div>
                  ) : (
                    sharedAudioItems.map(m => (
                      <div key={m.id} className="shared-media-item-row" onClick={() => scrollToMessage(m.id)}>
                        <div className="shared-media-doc-icon">🎙️</div>
                        <div className="shared-media-doc-info">
                          <span className="shared-media-doc-title">{m.media?.type === 'voice' ? 'Ovozli xabar' : m.media?.fileName || 'Audio'}</span>
                          <span className="shared-media-doc-sub">{m.media?.duration ? fmtDur(m.media.duration) : ''} • {new Date(m.date * 1000).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>
      )}

      <style jsx>{`
        @media (max-width: 768px) { #back-btn { display:flex !important; } }
        #back-btn { display:none; }
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.9); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

function SharedMediaGridItem({ msg, chatId, onClick }: { msg: Message; chatId: string; onClick: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    downloadMessagePhoto(chatId, msg.id, 's').then(u => {
      if (url === null) setUrl(u);
    });
  }, [msg.id, chatId, url]);

  return (
    <div className="shared-grid-photo" onClick={onClick}>
      {url ? <img src={url} alt="Grid photo" /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#888' }}>📷</div>}
    </div>
  );
}

function peerIdToMockPhone(id: string): string {
  let h = 0; for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i);
  const p = Math.abs(h).toString().slice(0, 9).padEnd(9, '7');
  return `+998 (${p.slice(0,2)}) ${p.slice(2,5)}-${p.slice(5,7)}-${p.slice(7,9)}`;
}

const SENDER_COLORS = ['#29b6f6', '#ec407a', '#ab47bc', '#66bb6a', '#ffa726', '#26c6da', '#ff7043', '#5c6bc0'];
function getSenderColor(id: string) {
  let h = 0; for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i);
  return SENDER_COLORS[Math.abs(h) % SENDER_COLORS.length];
}

function SenderName({ fromId, fallback }: { fromId?: string; fallback?: string }) {
  const [name, setName] = useState(fallback || '');

  useEffect(() => {
    if (fallback) { setName(fallback); return; }
    if (!fromId) return;

    const cached = getCachedPeer(fromId);
    if (cached?.name) { setName(cached.name); return; }

    let active = true;
    const loadSender = async () => {
      try {
        const { getTelegramClient } = await import('@/lib/telegram/client');
        const client = await getTelegramClient();
        const entity = await (client as any).getEntity(fromId);
        if (entity && active) {
          const resolvedName = entity.title || `${entity.firstName || ''} ${entity.lastName || ''}`.trim() || 'Unknown';
          cachePeer(fromId, { id: fromId, type: entity.className === 'User' ? 'user' : 'group', inputEntity: entity, name: resolvedName });
          setName(resolvedName);
        }
      } catch {}
    };
    loadSender();
    return () => { active = false; };
  }, [fromId, fallback]);

  if (!name) return <span style={{ opacity: 0.5 }}>...</span>;
  return <>{name}</>;
}

// ── MessageBubble ──────────────────────────────────────────
function MessageBubble({
  msg,
  chatId,
  peerType,
  chatName,
  onScrollTo,
}: {
  msg: Message;
  chatId: string;
  peerType: 'user' | 'group' | 'channel';
  chatName: string;
  onScrollTo: (msgId: number) => void;
}) {
  const time = fmtTime(msg.date);
  const isGroupOrChannel = peerType === 'group' || peerType === 'channel';
  const showSenderName = isGroupOrChannel && !msg.isOutgoing;

  const [repliedSnippet, setRepliedSnippet] = useState<string>('Yuklanmoqda...');
  const [repliedSenderName, setRepliedSenderName] = useState<string>('');

  useEffect(() => {
    if (!msg.replyToMsgId) return;
    const { messages } = useAppStore.getState();
    const list = messages[chatId] || [];
    const parent = list.find(m => m.id === msg.replyToMsgId);
    if (parent) {
      setRepliedSnippet(parent.text || (parent.media ? `[${parent.media.type === 'photo' ? 'Rasm' : 'Fayl'}]` : 'Xabar'));
      setRepliedSenderName(parent.senderName || (parent.isOutgoing ? 'Siz' : chatName));
    } else {
      setRepliedSenderName('Javob');
      setRepliedSnippet('Xabarni ko\'rish uchun bosing');
    }
  }, [msg.replyToMsgId, chatId, chatName]);

  // VoIP call bubbles
  if (msg.phoneCall) {
    const pc = msg.phoneCall;
    const isMissed = pc.reason === 'missed';
    let callLabel = '';
    let iconColor = '';
    let arrowSvg = null;

    if (msg.isOutgoing) {
      callLabel = pc.video ? 'Chiquvchi video' : 'Chiquvchi qo\'ng\'iroq';
      iconColor = '#4CAF50';
      arrowSvg = (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="3" style={{ transform: 'rotate(-45deg)' }}>
          <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
        </svg>
      );
    } else {
      if (isMissed) {
        callLabel = pc.video ? 'O\'tkazib yuborilgan video' : 'O\'tkazib yuborilgan qo\'ng\'iroq';
        iconColor = '#F44336';
        arrowSvg = (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="3" style={{ transform: 'rotate(135deg)' }}>
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
        );
      } else {
        callLabel = pc.video ? 'Kiruvchi video' : 'Kiruvchi qo\'ng\'iroq';
        iconColor = '#4CAF50';
        arrowSvg = (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="3" style={{ transform: 'rotate(135deg)' }}>
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
        );
      }
    }

    let durationLabel = '';
    if (!isMissed && pc.duration) {
      const m = Math.floor(pc.duration / 60);
      const s = pc.duration % 60;
      durationLabel = m > 0 ? `${m} m ${s} s` : `${s} soniya`;
    } else if (isMissed) {
      durationLabel = 'Javobsiz';
    } else {
      durationLabel = 'Ulanmadi';
    }

    return (
      <div className="message-bubble call-service-bubble" style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
        maxWidth: 280,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: '50%',
          background: msg.isOutgoing ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {pc.video ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.72a16 16 0 0 0 6.37 6.37l1.79-1.79a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>{callLabel}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
            {arrowSvg}
            <span>{durationLabel}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', alignSelf: 'flex-end', gap: 2 }}>
          <span style={{ fontSize: 10, opacity: 0.5, color: 'var(--text-secondary)' }}>{time}</span>
          {msg.isOutgoing && (
            <span className={`message-status ${msg.isRead ? 'read' : 'sent'}`} style={{ fontSize: 12 }}>
              {msg.isRead ? (
                <svg width="16" height="11" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 6 5 10 13 2"/><polyline points="7 6 11 10 17 2"/></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              )}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Determine theme: Outgoing is blue-purple (#2b5278) or purple (#794eb9)
  // Let's toggle purple if message has a specific pattern, or default it beautifully.
  // We can let outgoing messages have a gorgeous purple tint! (User's screenshot is purple)
  // Let's use 'purple' class for outgoing bubble.
  const isPurpleTheme = msg.isOutgoing;

  return (
    <div className={`message-bubble ${isPurpleTheme ? 'purple' : ''}`} style={{
      position: 'relative',
      padding: msg.media?.type === 'photo' ? 0 : '8px 12px 10px',
      maxWidth: '75%',
      display: 'inline-block',
      boxShadow: '0 1px 1.5px rgba(0,0,0,0.15)',
    }}>
      
      {/* Sender Name */}
      {showSenderName && (
        <div style={{
          fontWeight: 600,
          fontSize: 12.5,
          color: getSenderColor(msg.fromId || ''),
          marginBottom: 4,
          cursor: 'pointer',
        }}>
          <SenderName fromId={msg.fromId} fallback={msg.senderName} />
        </div>
      )}

      {/* Forwarded label matching Screenshot 8 */}
      {msg.forwarded && (
        <div style={{
          fontSize: 11,
          color: 'var(--accent)',
          borderLeft: '2px solid var(--accent)',
          paddingLeft: 8,
          marginBottom: 5,
          opacity: 0.9,
        }}>
          Quyidagidan uzatilgan: <span style={{ fontWeight: 500, color: 'white' }}>Rahmonbergan_oo4</span>
        </div>
      )}

      {/* Reply Preview */}
      {msg.replyToMsgId && (
        <div className="bubble-reply-preview" onClick={() => onScrollTo(msg.replyToMsgId!)}>
          <span className="bubble-reply-name">{repliedSenderName}</span>
          <span className="bubble-reply-text">{repliedSnippet}</span>
        </div>
      )}

      {/* Media Type Rendering */}
      {msg.media && (
        <MediaContent media={msg.media} msgId={msg.id} chatId={chatId} isOut={msg.isOutgoing} time={time}/>
      )}

      {/* Text wrapper with inline float wrapping for time */}
      {msg.text && (
        <div style={{ display: 'block', overflow: 'hidden' }}>
          <span className="message-text" style={{ fontSize: 14.5, lineHeight: 1.4, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
            {linkify(msg.text)}
          </span>
          <span className="message-meta-inline">
            {msg.editDate && <span style={{ fontSize: 9, opacity: 0.5, marginRight: 2 }}>tahrirlangan</span>}
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>{time}</span>
            {msg.isOutgoing && (
              <span className={`message-status ${msg.isRead ? 'read' : 'sent'}`}>
                {msg.isRead ? (
                  <svg width="15" height="11" viewBox="0 0 18 12" fill="none" stroke="white" strokeWidth="2"><polyline points="1 6 5 10 13 2"/><polyline points="7 6 11 10 17 2"/></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                )}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Media renderer ─────────────────────────────────────────
function MediaContent({
  media, msgId, chatId, isOut, time
}: {
  media: NonNullable<Message['media']>;
  msgId: number;
  chatId: string;
  isOut: boolean;
  time: string;
}) {
  const [url, setUrl]   = useState<string|null>(null);
  const [err, setErr]   = useState(false);
  const [loading, setL] = useState(false);

  const needDownload = media.type === 'photo' || media.type === 'video' || media.type === 'gif' || media.type === 'sticker';

  useEffect(() => {
    if (!needDownload) return;
    setL(true);
    downloadMessagePhoto(chatId, msgId, media.type === 'video' ? 's' : 'x')
      .then(u => { setUrl(u); if (!u) setErr(true); })
      .catch(() => setErr(true))
      .finally(() => setL(false));
  }, [msgId, chatId, needDownload, media.type]);

  const textColor = isOut ? 'rgba(255,255,255,.85)' : 'var(--text-secondary)';

  // Photos: No bubble borders, fills bubble completely, time overlay
  if (media.type === 'photo') {
    return (
      <div className="photo-bubble-wrapper">
        {loading && <div className="spinner" style={{ margin: 60 }} />}
        {url && (
          <>
            <img src={url} alt="Photo" style={{ width: '100%', maxHeight: 380, display: 'block', objectFit: 'cover' }} />
            <div className="photo-time-overlay">
              <span>{time}</span>
              {isOut && <span style={{ color: 'white', display: 'flex', alignItems: 'center' }}>✓✓</span>}
            </div>
          </>
        )}
        {err && !loading && (
          <div style={{ padding: '24px', background: '#182533', color: 'white', textAlign: 'center' }}>📷 Rasm yuklanmadi</div>
        )}
      </div>
    );
  }

  // Videos
  if (media.type === 'video') {
    return (
      <div className="photo-bubble-wrapper" style={{ background: '#000' }}>
        {loading && <div className="spinner" style={{ margin: 50 }} />}
        {url && (
          <>
            <img src={url} alt="Video thumbnail" style={{ width: '100%', maxHeight: 300, display: 'block', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.3)' }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </div>
            </div>
            <div className="photo-time-overlay">
              {media.duration && <span style={{ marginRight: 4 }}>{fmtDur(media.duration)}</span>}
              <span>{time}</span>
              {isOut && <span>✓✓</span>}
            </div>
          </>
        )}
      </div>
    );
  }

  // Voice Notes
  if (media.type === 'voice') return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', minWidth: 200 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#0088cc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        🎙️
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ height: 2, background: 'rgba(255,255,255,0.2)', borderRadius: 1 }} />
        <div style={{ fontSize: 11, marginTop: 4, color: 'rgba(255,255,255,0.7)' }}>{fmtDur(media.duration)} • Ovozli</div>
      </div>
    </div>
  );

  // Audio Music
  if (media.type === 'audio') return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🎵</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'white' }}>{media.fileName||'Audio'}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{fmtDur(media.duration)}</div>
      </div>
    </div>
  );

  // Document (PDF Card preview override matching Screenshot 8)
  if (media.type === 'document') {
    const isPdf = media.fileName?.toLowerCase().includes('.pdf');
    return (
      <div className="pdf-preview-card">
        {/* PDF thumbnail mockup on the left */}
        {isPdf ? (
          <div className="pdf-thumbnail">
            <div style={{ width: '100%', height: '100%', background: 'white', padding: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ height: 4, background: '#2aabee', borderRadius: 1 }} />
              <div style={{ height: 3, background: '#e0e0e0', width: '80%' }} />
              <div style={{ height: 3, background: '#e0e0e0', width: '60%' }} />
              <div style={{ height: 3, background: '#e0e0e0', width: '70%' }} />
            </div>
          </div>
        ) : (
          <div className="pdf-icon-placeholder">📄</div>
        )}
        <div className="pdf-info">
          <span className="pdf-name">{media.fileName || 'Fayl'}</span>
          <span className="pdf-size">{media.fileSize ? fmtSize(media.fileSize) : ''} PDF</span>
        </div>
        <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>⋮</div>
      </div>
    );
  }

  // Sticker
  if (media.type === 'sticker') {
    return (
      <div style={{ maxWidth: 160, maxHeight: 160, minWidth: 60, minHeight: url ? 0 : 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {loading && <div className="spinner" style={{ margin: 20 }} />}
        {url && <img src={url} alt="Sticker" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
        {err && !loading && <span style={{ fontSize: 32 }}>🎭</span>}
      </div>
    );
  }

  if (media.type === 'gif') return (
    <div style={{ padding: '4px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.1)', fontSize: 13, color: 'white' }}>GIF</div>
  );

  return null;
}

// ── linkify ────────────────────────────────────────────────
function linkify(text: string): React.ReactNode {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer"
          style={{color:'#2aabee',textDecoration:'underline'}}>
          {part}
        </a>
      );
    }
    return part;
  });
}
