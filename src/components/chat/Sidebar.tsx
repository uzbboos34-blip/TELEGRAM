'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { getDialogs, Dialog } from '@/lib/telegram/dialogs';
import { logout, getCurrentUser } from '@/lib/telegram/auth';
import { downloadProfilePhoto } from '@/lib/telegram/media';

// ── Avatar helpers ─────────────────────────────────────────
const GRADS = [
  'avatar-gradient-1','avatar-gradient-2','avatar-gradient-3',
  'avatar-gradient-4','avatar-gradient-5','avatar-gradient-6',
  'avatar-gradient-7','avatar-gradient-8',
];
function getGrad(id: string) {
  let h = 0;
  for (let i=0;i<id.length;i++) h=((h<<5)-h)+id.charCodeAt(i);
  return GRADS[Math.abs(h)%GRADS.length];
}
function getInitials(name: string) {
  return name.split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';
}
function formatTime(ts?: number) {
  if (!ts) return '';
  const d=new Date(ts*1000), now=new Date(), diff=now.getTime()-d.getTime();
  const day=86400000;
  if (diff<day) return d.toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'});
  if (diff<7*day) return d.toLocaleDateString('ru',{weekday:'short'});
  return d.toLocaleDateString('ru',{day:'2-digit',month:'2-digit'});
}

// ── TelegramAvatar — profil rasimini yuklaydigan avatar ────
function TelegramAvatar({ dialog, size = 54 }: { dialog: Dialog; size?: number }) {
  const [photoUrl, setPhotoUrl] = useState<string|null>(null);
  const [photoErr, setPhotoErr] = useState(false);
  const grad = getGrad(dialog.id);

  useEffect(() => {
    // Only load for users (not groups/channels)
    if (!dialog.isGroup && !dialog.isChannel && !dialog.isBot) {
      downloadProfilePhoto(dialog.id)
        .then(url => { if (url) setPhotoUrl(url); })
        .catch(() => {});
    }
  }, [dialog.id, dialog.isGroup, dialog.isChannel, dialog.isBot]);

  const showPhoto = photoUrl && !photoErr;

  return (
    <div className={`dialog-avatar ${grad}`}
      style={{width:size, height:size, position:'relative', overflow:'hidden', flexShrink:0}}>
      {showPhoto ? (
        <img src={photoUrl} alt={dialog.name}
          style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}
          onError={() => setPhotoErr(true)}
        />
      ) : dialog.isChannel ? (
        <span style={{fontSize:22}}>📢</span>
      ) : dialog.isGroup ? (
        <span style={{fontSize:22}}>👥</span>
      ) : dialog.isBot ? (
        <span style={{fontSize:22}}>🤖</span>
      ) : (
        <span>{getInitials(dialog.name)}</span>
      )}
      {dialog.online && <span className="online-dot"/>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
export default function Sidebar() {
  const router = useRouter();
  const {
    dialogs, setDialogs, activeChatId,
    setActiveChat, sidebarOpen, setSidebarOpen,
  } = useAppStore();

  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenu]   = useState(false);
  const user = getCurrentUser();

  const loadDialogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDialogs(100);
      setDialogs(data);
    } catch (e) {
      console.error('[Sidebar] loadDialogs:', e);
    } finally {
      setLoading(false);
    }
  }, [setDialogs]);

  useEffect(() => { loadDialogs(); }, [loadDialogs]);

  const filtered = dialogs.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  function openChat(d: Dialog) {
    setActiveChat(d.id, d.type as any, d.name);
    router.push(`/chats/${d.id}?type=${d.type}`);
    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div onClick={()=>setSidebarOpen(false)}
          style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',
            zIndex:49,display:'none'}}
          className="mobile-overlay"/>
      )}

      <aside className={`sidebar ${sidebarOpen?'open':''}`}>

        {/* ── Header ─────────────────────────── */}
        <div className="header">
          <button className="icon-btn" onClick={()=>setMenu(!menuOpen)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <span className="header-title">Ross Messenger</span>
          <button className="icon-btn" onClick={loadDialogs} title="Yangilash">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
          <button className="icon-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </div>

        {/* ── Dropdown menu ───────────────────── */}
        {menuOpen && (
          <>
            <div onClick={()=>setMenu(false)}
              style={{position:'fixed',inset:0,zIndex:9}}/>
            <div className="context-menu" style={{top:60,left:16,zIndex:10}}>
              <div className="context-menu-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                <span>{user?.firstName} {user?.lastName}</span>
              </div>
              <div style={{height:1,background:'var(--divider)'}}/>
              <div className="context-menu-item" onClick={()=>{router.push('/settings');setMenu(false);}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                <span>Sozlamalar</span>
              </div>
              <div className="context-menu-item danger" onClick={async()=>{await logout();router.replace('/login');}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                <span>Chiqish</span>
              </div>
            </div>
          </>
        )}

        {/* ── Search ──────────────────────────── */}
        <div className="search-bar">
          <div className="search-input-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input className="search-input" placeholder="Qidirish"
              value={search} onChange={e=>setSearch(e.target.value)}/>
            {search && (
              <button className="icon-btn" style={{width:24,height:24}} onClick={()=>setSearch('')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* ── Dialog List ─────────────────────── */}
        <div className="dialog-list">
          {loading ? (
            <SkeletonList/>
          ) : filtered.length === 0 ? (
            <div style={{padding:'40px 20px',textAlign:'center',color:'var(--text-secondary)'}}>
              {search ? 'Topilmadi' : 'Chatlar yo\'q'}
            </div>
          ) : (
            filtered.map(d => (
              <DialogItem key={d.id} dialog={d}
                isActive={d.id===activeChatId}
                onClick={()=>openChat(d)}/>
            ))
          )}
        </div>
      </aside>
    </>
  );
}

// ── DialogItem ─────────────────────────────────────────────
function DialogItem({ dialog, isActive, onClick }: {
  dialog: Dialog; isActive: boolean; onClick: ()=>void;
}) {
  const time = formatTime(dialog.lastMessageDate);

  return (
    <div className={`dialog-item ${isActive?'active':''}`} onClick={onClick}>
      <TelegramAvatar dialog={dialog}/>

      <div className="dialog-content">
        <div className="dialog-top">
          <span className="dialog-name">
            {dialog.isPinned && <span style={{fontSize:12,marginRight:4}}>📌</span>}
            {dialog.name}
          </span>
          <span className={`dialog-time ${dialog.unreadCount>0?'unread':''}`}>{time}</span>
        </div>
        <div className="dialog-bottom">
          <span className="dialog-last-msg">
            {dialog.lastMessage ||
              (dialog.isChannel?'Kanal':dialog.isGroup?'Guruh':'Yangi chat')}
          </span>
          {dialog.unreadCount > 0 && (
            <span className={`unread-badge ${dialog.isMuted?'muted':''}`}>
              {dialog.unreadCount>99?'99+':dialog.unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────
function SkeletonList() {
  return (
    <>
      {Array.from({length:10}).map((_,i)=>(
        <div key={i} className="dialog-item" style={{pointerEvents:'none'}}>
          <div className="skeleton" style={{width:54,height:54,borderRadius:'50%',flexShrink:0}}/>
          <div style={{flex:1,display:'flex',flexDirection:'column',gap:8}}>
            <div className="skeleton" style={{height:13,width:'55%',borderRadius:4}}/>
            <div className="skeleton" style={{height:11,width:'80%',borderRadius:4}}/>
          </div>
        </div>
      ))}
    </>
  );
}
