'use client';

import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { logout, getCurrentUser } from '@/lib/telegram/auth';

export default function SettingsPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useAppStore();
  const user = getCurrentUser();

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  const initials = user
    ? ([user.firstName, user.lastName].filter(Boolean).join(' ')[0] || '?').toUpperCase()
    : '?';

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="chat-header">
        <button className="icon-btn" onClick={() => router.back()}>
          <ArrowLeftIcon />
        </button>
        <span className="header-title">Sozlamalar</span>
      </div>

      <div style={{ padding: '16px' }}>
        {/* Profile Card */}
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          cursor: 'pointer',
        }}>
          <div className="dialog-avatar avatar-gradient-4" style={{ width: 64, height: 64, fontSize: 24 }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, color: 'var(--text-primary)' }}>
              {user ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Noma\'lum'}
            </div>
            {user?.username && (
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--accent)' }}>
                @{user.username}
              </div>
            )}
            {user?.phone && (
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                {user.phone}
              </div>
            )}
          </div>
        </div>

        {/* Notification settings */}
        <div className="settings-section">
          <div className="settings-item">
            <div className="settings-item-icon" style={{ background: '#2AABEE' }}>
              <BellIcon />
            </div>
            <div className="settings-item-content">
              <div className="settings-item-title">Bildirishnomalar</div>
              <div className="settings-item-subtitle">Barcha chatlar uchun yoqilgan</div>
            </div>
            <ArrowRightIcon />
          </div>
          <div className="settings-item">
            <div className="settings-item-icon" style={{ background: '#4CAF50' }}>
              <LockIcon />
            </div>
            <div className="settings-item-content">
              <div className="settings-item-title">Maxfiylik va Xavfsizlik</div>
              <div className="settings-item-subtitle">2FA, aktiv sessiyalar</div>
            </div>
            <ArrowRightIcon />
          </div>
        </div>

        {/* Appearance */}
        <div className="settings-section">
          <div className="settings-item" onClick={toggleTheme}>
            <div className="settings-item-icon" style={{ background: '#9C27B0' }}>
              <PaletteIcon />
            </div>
            <div className="settings-item-content">
              <div className="settings-item-title">Ko'rinish</div>
              <div className="settings-item-subtitle">{theme === 'dark' ? 'Qorang\'i rejim' : 'Yorug\' rejim'}</div>
            </div>
            <div style={{
              width: 48, height: 28, borderRadius: 14,
              background: theme === 'dark' ? 'var(--accent)' : 'var(--border)',
              position: 'relative', transition: 'background 0.2s',
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', background: 'white',
                position: 'absolute', top: 3,
                left: theme === 'dark' ? 23 : 3,
                transition: 'left 0.2s',
              }} />
            </div>
          </div>
          <div className="settings-item">
            <div className="settings-item-icon" style={{ background: '#FF9800' }}>
              <LanguageIcon />
            </div>
            <div className="settings-item-content">
              <div className="settings-item-title">Til</div>
              <div className="settings-item-subtitle">O'zbek tili</div>
            </div>
            <ArrowRightIcon />
          </div>
        </div>

        {/* Network */}
        <div className="settings-section">
          <div className="settings-item">
            <div className="settings-item-icon" style={{ background: '#2196F3' }}>
              <NetworkIcon />
            </div>
            <div className="settings-item-content">
              <div className="settings-item-title">Tarmoq sozlamalari</div>
              <div className="settings-item-subtitle">Proxy: Cloudflare Worker</div>
            </div>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--online)',
            }} />
          </div>
        </div>

        {/* App info */}
        <div className="settings-section">
          <div className="settings-item">
            <div className="settings-item-icon" style={{ background: '#607D8B' }}>
              <InfoIcon />
            </div>
            <div className="settings-item-content">
              <div className="settings-item-title">Ross Messenger haqida</div>
              <div className="settings-item-subtitle">Versiya 1.0.0</div>
            </div>
            <ArrowRightIcon />
          </div>
        </div>

        {/* Logout */}
        <div className="settings-section">
          <div className="settings-item" onClick={handleLogout} style={{ color: 'var(--error)' }}>
            <div className="settings-item-icon" style={{ background: 'var(--error)' }}>
              <LogoutIcon />
            </div>
            <div className="settings-item-content">
              <div className="settings-item-title" style={{ color: 'var(--error)' }}>Chiqish</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Icons
function ArrowLeftIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>; }
function ArrowRightIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>; }
function BellIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>; }
function LockIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>; }
function PaletteIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>; }
function LanguageIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>; }
function NetworkIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>; }
function InfoIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>; }
function LogoutIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>; }
