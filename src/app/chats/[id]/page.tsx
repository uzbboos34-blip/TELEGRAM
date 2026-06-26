'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { getMessages, sendMessage, markAsRead, Message } from '@/lib/telegram/messages';
import { downloadMessagePhoto } from '@/lib/telegram/media';
import { getCachedPeer } from '@/lib/telegram/peer-cache';
import TelegramAvatar from '@/components/chat/TelegramAvatar';

// ── Helpers ────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────
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
  const chatMsgs  = messages[chatId] || [];
  const grouped   = groupByDate(chatMsgs);

  // ── Ovoz yozishni boshlash ───────────────────────────
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
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
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

  // ── Ovoz yozishni to'xtatish va yuborish ──────────────
  function stopAndSendRecording() {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }

  // ── Ovoz yozishni bekor qilish ───────────────────────
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
    return () => {
      if (recTimerRef.current) clearInterval(recTimerRef.current);
    };
  }, []);

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
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:'smooth'}); },[chatMsgs.length]);

  async function handleSend() {
    const msg = text.trim();
    if (!msg||sending) return;
    setText(''); setSending(true);
    const tmp: Message = { id:Date.now(), text:msg, date:Math.floor(Date.now()/1000),
      isOutgoing:true, isRead:false };
    addMessage(chatId, tmp);
    try { await sendMessage(chatId, peerType, msg); }
    catch(e:any) { setErr('Yuborilmadi: '+(e?.message||'')); }
    finally { setSending(false); }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>

      {/* ── Header ──────────────────────────────── */}
      <div className="chat-header">
        <button className="icon-btn" id="back-btn"
          onClick={()=>{ setSidebarOpen(true); router.push('/chats'); }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>

        <TelegramAvatar id={chatId} name={chatName} type={peerType} isOnline={peer?.isOnline} size={40} />

        <div className="chat-header-info">
          <div className="chat-header-name">{chatName}</div>
          <div className={`chat-header-status ${peer?.isOnline ? 'online-status' : ''}`}>
            {peer?.isOnline
              ? <><span style={{color:'#4CAF50',marginRight:3}}>●</span>online</>
              : peerType === 'group'
              ? (peer?.memberCount ? `${peer.memberCount.toLocaleString()} a'zo` : 'guruh')
              : peerType === 'channel'
              ? (peer?.memberCount ? `${peer.memberCount.toLocaleString()} obunachilar` : 'kanal')
              : peer?.statusText || "oxirgi marta ko'rilgan"}
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
        <button className="icon-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
          </svg>
        </button>
      </div>

      {/* ── Messages ─────────────────────────────── */}
      <div className="messages-area">
        {loading ? (
          <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100%'}}>
            <div className="spinner"/>
          </div>
        ) : err && chatMsgs.length===0 ? (
          <div style={{textAlign:'center',padding:'60px 20px',color:'var(--text-secondary)'}}>
            <p style={{fontSize:32,marginBottom:12}}>⚠️</p>
            <p style={{marginBottom:16}}>{err}</p>
            <button className="btn btn-primary" style={{width:'auto',padding:'10px 24px'}} onClick={load}>
              Qayta urinish
            </button>
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
                <MessageBubble key={msg.id} msg={msg} chatId={chatId}/>
              ))}
            </div>
          ))
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Error toast */}
      {err && chatMsgs.length>0 && (
        <div style={{
          margin:'0 12px 6px',padding:'8px 14px',
          background:'rgba(229,57,53,.12)',border:'1px solid rgba(229,57,53,.3)',
          borderRadius:'var(--radius-md)',color:'var(--error)',fontSize:13,
        }}>{err}</div>
      )}

      {/* ── Input ────────────────────────────────── */}
      <div className="input-area">
        {isRecording ? (
          <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 16 }}>
            {/* Red flashing dot and recording indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <span className="recording-dot" style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: 'var(--error)',
                display: 'inline-block',
                animation: 'pulse 1.2s infinite ease-in-out',
              }}/>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                Ovozli xabar yozilmoqda: <strong>{fmtDur(recDuration)}</strong>
              </span>
            </div>
            
            {/* Action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="icon-btn" onClick={cancelRecording} title="Bekor qilish" style={{ color: 'var(--error)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  <line x1="10" y1="11" x2="10" y2="17"/>
                  <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
              </button>
              <button className="send-btn" onClick={stopAndSendRecording} title="Yuborish" style={{ background: 'var(--accent)', color: 'white' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="input-actions-left">
              <button className="icon-btn">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                  <line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
                </svg>
              </button>
            </div>

            <div className="input-field-wrap">
              <textarea ref={inputRef} className="message-input"
                placeholder="Xabar yozing..." value={text} rows={1}
                onChange={e=>{
                  setText(e.target.value);
                  e.target.style.height='auto';
                  e.target.style.height=Math.min(e.target.scrollHeight,120)+'px';
                }}
                onKeyDown={handleKey}
              />
            </div>

            <div className="input-actions-right">
              {text.trim() ? (
                <button className="send-btn" onClick={handleSend} disabled={sending}>
                  {sending
                    ? <div className="spinner" style={{width:18,height:18,borderWidth:2,borderColor:'rgba(255,255,255,.3)',borderTopColor:'white'}}/>
                    : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  }
                </button>
              ) : <>
                <button className="icon-btn">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                </button>
                <button className="icon-btn" onClick={startRecording} title="Ovoz yozish">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                </button>
              </>}
            </div>
          </>
        )}
      </div>

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

// ── MessageBubble ──────────────────────────────────────────
function MessageBubble({ msg, chatId }: { msg: Message; chatId: string }) {
  const time = fmtTime(msg.date);

  return (
    <div className={`message-row ${msg.isOutgoing ? 'out' : 'in'}`}>
      <div className="message-bubble">
        {/* Forwarded */}
        {msg.forwarded && (
          <div style={{
            fontSize:12,color:'var(--accent)',borderLeft:'2px solid var(--accent)',
            paddingLeft:8,marginBottom:4,opacity:.85,
          }}>
            Yo'naltirilgan xabar
          </div>
        )}

        {/* Reply */}
        {msg.replyToMsgId && (
          <div style={{
            fontSize:12,borderLeft:'3px solid var(--accent)',paddingLeft:8,
            marginBottom:6,color:'var(--text-secondary)',opacity:.9,
          }}>
            Javob
          </div>
        )}

        {/* Media */}
        {msg.media && (
          <MediaContent media={msg.media} msgId={msg.id} chatId={chatId} isOut={msg.isOutgoing}/>
        )}

        {/* Text */}
        {msg.text && (
          <p className="message-text" style={{
            wordBreak:'break-word',
            whiteSpace:'pre-wrap',
            marginTop: msg.media ? 4 : 0,
          }}>
            {linkify(msg.text)}
          </p>
        )}

        {/* Meta */}
        <div className="message-meta">
          {msg.editDate && <span style={{fontSize:10,opacity:.5,marginRight:2}}>tahrirlangan</span>}
          <span className="message-time">{time}</span>
          {msg.isOutgoing && (
            <span className={`message-status ${msg.isRead?'read':'sent'}`}>
              {msg.isRead
                ? <svg width="18" height="12" viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 6 5 10 13 2"/><polyline points="7 6 11 10 17 2"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              }
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Media renderer ─────────────────────────────────────────
function MediaContent({
  media, msgId, chatId, isOut,
}: {
  media: NonNullable<Message['media']>;
  msgId: number;
  chatId: string;
  isOut: boolean;
}) {
  const [url, setUrl]   = useState<string|null>(null);
  const [err, setErr]   = useState(false);
  const [loading, setL] = useState(false);

  const needDownload = media.type === 'photo' || media.type === 'video' || media.type === 'gif';

  useEffect(() => {
    if (!needDownload) return;
    setL(true);
    downloadMessagePhoto(chatId, msgId, media.type === 'video' ? 's' : 'x')
      .then(u => { setUrl(u); if (!u) setErr(true); })
      .catch(() => setErr(true))
      .finally(() => setL(false));
  }, [msgId, chatId, needDownload, media.type]);

  const textColor = isOut ? 'rgba(255,255,255,.85)' : 'var(--text-secondary)';

  // Photo
  if (media.type === 'photo') {
    return (
      <div style={{
        maxWidth:260, borderRadius:12, overflow:'hidden',
        background:'var(--bg-tertiary)', marginBottom:2,
        minWidth:80, minHeight: url ? 0 : 160,
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        {loading && <div className="spinner" style={{margin:40}}/>}
        {url && <img src={url} alt="Photo" style={{
          width:'100%', display:'block', borderRadius:12,
          maxHeight:400, objectFit:'cover',
        }}/>}
        {err && !loading && <span style={{padding:16,fontSize:13,color:'var(--text-secondary)'}}>📷 Rasm</span>}
      </div>
    );
  }

  // Video
  if (media.type === 'video') {
    return (
      <div style={{
        maxWidth:260, borderRadius:12, overflow:'hidden',
        background:'#000', position:'relative', marginBottom:2,
        minHeight: url ? 0 : 120,
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        {loading && <div className="spinner" style={{margin:30}}/>}
        {url && (
          <>
            <img src={url} alt="Video thumbnail" style={{
              width:'100%', display:'block', maxHeight:300, objectFit:'cover',
            }}/>
            <div style={{
              position:'absolute', inset:0, display:'flex',
              alignItems:'center', justifyContent:'center',
              background:'rgba(0,0,0,.3)',
            }}>
              <div style={{
                width:44, height:44, borderRadius:'50%',
                background:'rgba(0,0,0,.65)',
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              </div>
            </div>
            {media.duration && (
              <span style={{
                position:'absolute', bottom:6, right:8,
                fontSize:11, color:'white', background:'rgba(0,0,0,.5)',
                padding:'1px 5px', borderRadius:4,
              }}>
                {fmtDur(media.duration)}
              </span>
            )}
          </>
        )}
        {err && !loading && <span style={{padding:16,fontSize:13,color:'#888'}}>🎥 Video</span>}
      </div>
    );
  }

  // Voice
  if (media.type === 'voice') return (
    <div style={{display:'flex',alignItems:'center',gap:10,padding:'4px 0'}}>
      <div style={{
        width:38,height:38,borderRadius:'50%',
        background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',
        flexShrink:0,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="white" fill="none" strokeWidth="2"/>
        </svg>
      </div>
      <div style={{flex:1}}>
        <div style={{height:2,background:'rgba(255,255,255,.25)',borderRadius:1}}/>
        <div style={{fontSize:11,marginTop:4,color:textColor}}>{fmtDur(media.duration)} • Ovozli</div>
      </div>
    </div>
  );

  // Audio
  if (media.type === 'audio') return (
    <div style={{display:'flex',alignItems:'center',gap:10,padding:'4px 0'}}>
      <div style={{
        width:38,height:38,borderRadius:'50%',
        background:'rgba(255,255,255,.1)',display:'flex',alignItems:'center',justifyContent:'center',
      }}>
        🎵
      </div>
      <div>
        <div style={{fontSize:13,fontWeight:500,color:'var(--text-primary)'}}>{media.fileName||'Audio'}</div>
        <div style={{fontSize:11,color:textColor}}>{fmtDur(media.duration)}</div>
      </div>
    </div>
  );

  // Document / sticker / gif
  if (media.type === 'document') return (
    <div style={{display:'flex',alignItems:'center',gap:10,padding:'6px 0'}}>
      <div style={{
        width:42,height:42,borderRadius:10,
        background:'rgba(255,255,255,.08)',display:'flex',alignItems:'center',justifyContent:'center',
        fontSize:22, flexShrink:0,
      }}>
        {media.fileName?.includes('.pdf') ? '📄'
          : media.fileName?.includes('.zip') || media.fileName?.includes('.rar') ? '🗜️'
          : '📎'}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:500,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
          {media.fileName||'Fayl'}
        </div>
        {media.fileSize ? (
          <div style={{fontSize:11,color:textColor}}>{fmtSize(media.fileSize)}</div>
        ) : null}
      </div>
    </div>
  );

  if (media.type === 'sticker') return (
    <div style={{fontSize:48,lineHeight:1}}>🎭</div>
  );

  if (media.type === 'gif') return (
    <div style={{
      padding:'4px 8px', borderRadius:8,
      background:'rgba(255,255,255,.1)',
      fontSize:13, color:textColor,
    }}>GIF</div>
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
          style={{color:'var(--accent)',textDecoration:'underline'}}>
          {part}
        </a>
      );
    }
    return part;
  });
}
