'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { getDialogs, Dialog } from '@/lib/telegram/dialogs';
import { logout, getCurrentUser } from '@/lib/telegram/auth';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';

const AVATAR_GRADIENTS = [
  'avatar-gradient-1', 'avatar-gradient-2', 'avatar-gradient-3',
  'avatar-gradient-4', 'avatar-gradient-5', 'avatar-gradient-6',
  'avatar-gradient-7', 'avatar-gradient-8',
];

function getAvatarGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase() || '?';
}

function formatTime(timestamp?: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const dayMs = 86400000;

  if (diff < dayMs) {
    return date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  } else if (diff < 7 * dayMs) {
    return date.toLocaleDateString('ru', { weekday: 'short' });
  } else {
    return date.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' });
  }
}

export default function Sidebar() {
  const router = useRouter();
  const { dialogs, setDialogs, activeChatId, setActiveChat, sidebarOpen, setSidebarOpen } = useAppStore();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const user = getCurrentUser();

  const loadDialogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getDialogs(50);
      setDialogs(data);
    } catch (e) {
      console.error('Failed to load dialogs:', e);
    } finally {
      setLoading(false);
    }
  }, [setDialogs]);

  useEffect(() => {
    loadDialogs();
  }, [loadDialogs]);

  const filteredDialogs = dialogs.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  function handleDialogClick(dialog: Dialog) {
    setActiveChat(dialog.id, dialog.type as 'user' | 'group' | 'channel', dialog.name);
    router.push(`/chats/${dialog.id}?type=${dialog.type}`);
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 49, display: 'none',
          }}
          className="mobile-overlay"
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* Header */}
        <div className="header">
          <button className="icon-btn" onClick={() => setMenuOpen(!menuOpen)}>
            <HamburgerIcon />
          </button>
          <span className="header-title">Ross Messenger</span>
          <button className="icon-btn" onClick={() => {}}>
            <SearchIcon />
          </button>
          <button className="icon-btn" onClick={() => {}}>
            <EditIcon />
          </button>
        </div>

        {/* Dropdown Menu */}
        {menuOpen && (
          <>
            <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9 }} />
            <div className="context-menu" style={{ top: 60, left: 16, zIndex: 10 }}>
              <div className="context-menu-item">
                <UserIcon />
                <span>{user?.firstName} {user?.lastName}</span>
              </div>
              <div style={{ height: 1, background: 'var(--divider)' }} />
              <div className="context-menu-item" onClick={() => router.push('/settings')}>
                <SettingsIcon />
                <span>Sozlamalar</span>
              </div>
              <div className="context-menu-item danger" onClick={handleLogout}>
                <LogoutIcon />
                <span>Chiqish</span>
              </div>
            </div>
          </>
        )}

        {/* Search */}
        <div className="search-bar">
          <div className="search-input-wrap">
            <SearchIcon size={16} />
            <input
              className="search-input"
              placeholder="Qidirish"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => setSearch('')}>
                <CloseIcon size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Dialog List */}
        <div className="dialog-list">
          {loading ? (
            <SkeletonList />
          ) : filteredDialogs.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              {search ? 'Topilmadi' : 'Chatlar yo\'q'}
            </div>
          ) : (
            filteredDialogs.map((dialog) => (
              <DialogItem
                key={dialog.id}
                dialog={dialog}
                isActive={dialog.id === activeChatId}
                onClick={() => handleDialogClick(dialog)}
              />
            ))
          )}
        </div>
      </aside>
    </>
  );
}

function DialogItem({
  dialog, isActive, onClick,
}: {
  dialog: Dialog;
  isActive: boolean;
  onClick: () => void;
}) {
  const initials = getInitials(dialog.name);
  const gradient = getAvatarGradient(dialog.id);
  const time = formatTime(dialog.lastMessageDate);

  return (
    <div className={`dialog-item ${isActive ? 'active' : ''}`} onClick={onClick}>
      {/* Avatar */}
      <div className={`dialog-avatar ${gradient}`}>
        {dialog.isChannel ? (
          <span style={{ fontSize: '22px' }}>📢</span>
        ) : dialog.isGroup ? (
          <span style={{ fontSize: '22px' }}>👥</span>
        ) : dialog.isBot ? (
          <span style={{ fontSize: '22px' }}>🤖</span>
        ) : (
          <span>{initials}</span>
        )}
        {dialog.online && <span className="online-dot" />}
      </div>

      {/* Content */}
      <div className="dialog-content">
        <div className="dialog-top">
          <span className="dialog-name">{dialog.name}</span>
          <span className={`dialog-time ${dialog.unreadCount > 0 ? 'unread' : ''}`}>{time}</span>
        </div>
        <div className="dialog-bottom">
          <span className="dialog-last-msg">
            {dialog.lastMessage || (dialog.isChannel ? 'Kanal' : dialog.isGroup ? 'Guruh' : 'Yangi chat')}
          </span>
          {dialog.unreadCount > 0 && (
            <span className={`unread-badge ${dialog.isMuted ? 'muted' : ''}`}>
              {dialog.unreadCount > 99 ? '99+' : dialog.unreadCount}
            </span>
          )}
          {dialog.isPinned && !dialog.unreadCount && (
            <PinIcon />
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="dialog-item" style={{ pointerEvents: 'none' }}>
          <div className="skeleton" style={{ width: 54, height: 54, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="skeleton" style={{ height: 14, width: '60%', borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 12, width: '85%', borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </>
  );
}

// Icons
function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
function SearchIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function CloseIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z" />
    </svg>
  );
}
