'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { getDialogs, Dialog } from '@/lib/telegram/dialogs';
import { logout, getCurrentUser } from '@/lib/telegram/auth';
import { phoneCallManager } from '@/lib/webrtc/call-manager';
import TelegramAvatar from './TelegramAvatar';

// ── Time Formatting helper ─────────────────────────────────
function formatTime(ts?: number) {
  if (!ts) return '';
  const d = new Date(ts * 1000), now = new Date(), diff = now.getTime() - d.getTime();
  const day = 86400000;
  if (diff < day) return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  if (diff < 7 * day) return d.toLocaleDateString('ru', { weekday: 'short' });
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' });
}

// ── Stories Data matching user screenshot exactly ──────────
interface Story {
  id: string;
  name: string;
  avatar: string;
  media: string[];
  timestamp: string;
  hasUnread: boolean;
}

const STORIES_DATA: Story[] = [
  {
    id: 'asad',
    name: 'Asad',
    avatar: '/stories/asad_avatar.png',
    media: ['/stories/asad_content.png'],
    timestamp: '12 hours ago',
    hasUnread: true,
  },
  {
    id: 'husnid',
    name: 'Husnid A...',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    media: ['https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=600'],
    timestamp: '5 hours ago',
    hasUnread: true,
  },
  {
    id: 'laboy',
    name: 'Labo\'y Ur...',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    media: ['https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=600'],
    timestamp: '2 hours ago',
    hasUnread: true,
  },
  {
    id: 'ilhom',
    name: 'ILHOM A...',
    avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150',
    media: ['https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600'],
    timestamp: '10 hours ago',
    hasUnread: true,
  },
  {
    id: 'tumur',
    name: 'Tumur ak...',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    media: ['https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=600'],
    timestamp: '1 day ago',
    hasUnread: true,
  },
  {
    id: 'ogiljan',
    name: 'O\'giljan Yer...',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
    media: ['https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600'],
    timestamp: '18 hours ago',
    hasUnread: true,
  },
];

export default function Sidebar() {
  const router = useRouter();
  const {
    dialogs, setDialogs, activeChatId,
    setActiveChat, sidebarOpen, setSidebarOpen,
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenu] = useState(false);
  const user = getCurrentUser();

  const [activeFolder, setActiveFolder] = useState<'all' | 'personal' | 'unread' | 'predictions'>('all');
  const [sidebarTab, setSidebarTab] = useState<'chats' | 'calls'>('chats');

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  // ── Story Viewer States ──────────────────────────────────
  const [selectedStoryIndex, setSelectedStoryIndex] = useState<number | null>(null);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [storyProgress, setStoryProgress] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  const progressIntervalRef = useRef<any>(null);

  const handleStartNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchError('');
    try {
      const { searchAndCreateChat } = await import('@/lib/telegram/dialogs');
      const dialog = await searchAndCreateChat(searchQuery);
      if (dialog) {
        if (!dialogs.some(d => d.id === dialog.id)) {
          setDialogs([dialog, ...dialogs]);
        }
        setNewChatOpen(false);
        setSearchQuery('');
        openChat(dialog);
      } else {
        setSearchError('Foydalanuvchi topilmadi.');
      }
    } catch (err: any) {
      setSearchError('Xatolik: ' + (err?.message || err));
    } finally {
      setSearchLoading(false);
    }
  };

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

  const folderFiltered = dialogs.filter(d => {
    if (activeFolder === 'personal') return d.type === 'user' || d.type === 'bot';
    if (activeFolder === 'unread') return d.unreadCount > 0;
    if (activeFolder === 'predictions') return d.type === 'group' || d.type === 'channel';
    return true;
  });

  const filtered = folderFiltered.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  function openChat(d: Dialog) {
    setActiveChat(d.id, d.type as any, d.name);
    router.push(`/chats/${d.id}?type=${d.type}`);
    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  const startCall = async (userId: string, isVideo = false) => {
    try {
      await phoneCallManager.startCall(userId, isVideo);
    } catch (err: any) {
      alert(`Qo'ng'iroqni boshlab bo'lmadi: ${err.message}`);
    }
  };

  // ── Story Viewer Player loop ──────────────────────────────
  const closeStoryViewer = useCallback(() => {
    setSelectedStoryIndex(null);
    setActiveMediaIndex(0);
    setStoryProgress(0);
    setReplyText('');
    setIsLiked(false);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
  }, []);

  const handleNextStory = useCallback(() => {
    if (selectedStoryIndex === null) return;
    const currentStory = STORIES_DATA[selectedStoryIndex];
    if (activeMediaIndex < currentStory.media.length - 1) {
      setActiveMediaIndex(prev => prev + 1);
      setStoryProgress(0);
    } else if (selectedStoryIndex < STORIES_DATA.length - 1) {
      setSelectedStoryIndex(prev => (prev as number) + 1);
      setActiveMediaIndex(0);
      setStoryProgress(0);
    } else {
      closeStoryViewer();
    }
  }, [selectedStoryIndex, activeMediaIndex, closeStoryViewer]);

  const handlePrevStory = useCallback(() => {
    if (selectedStoryIndex === null) return;
    if (activeMediaIndex > 0) {
      setActiveMediaIndex(prev => prev - 1);
      setStoryProgress(0);
    } else if (selectedStoryIndex > 0) {
      setSelectedStoryIndex(prev => (prev as number) - 1);
      const prevStory = STORIES_DATA[(selectedStoryIndex as number) - 1];
      setActiveMediaIndex(prevStory.media.length - 1);
      setStoryProgress(0);
    } else {
      setStoryProgress(0);
    }
  }, [selectedStoryIndex, activeMediaIndex]);

  useEffect(() => {
    if (selectedStoryIndex === null) return;
    setStoryProgress(0);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

    const stepMs = 50;
    const totalMs = 5000;
    progressIntervalRef.current = setInterval(() => {
      setStoryProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressIntervalRef.current);
          handleNextStory();
          return 100;
        }
        return prev + (stepMs / totalMs) * 100;
      });
    }, stepMs);

    return () => { if (progressIntervalRef.current) clearInterval(progressIntervalRef.current); };
  }, [selectedStoryIndex, activeMediaIndex, handleNextStory]);

  const activeStory = selectedStoryIndex !== null ? STORIES_DATA[selectedStoryIndex] : null;

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
            zIndex: 49, display: 'none'
          }}
          className="mobile-overlay" />
      )}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>

        {/* ── 1. Vertical Folder Sidebar (Far Left - 72px) ── */}
        <div className="folder-sidebar">
          <div className="folder-items">
            {/* All Chats Folder */}
            <div className={`folder-item ${activeFolder === 'all' ? 'active' : ''}`}
              onClick={() => { setActiveFolder('all'); setSidebarTab('chats'); }}>
              <div className="folder-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <span className="folder-label">All Chats</span>
            </div>

            {/* Shaxsiy Folder */}
            <div className={`folder-item ${activeFolder === 'personal' ? 'active' : ''}`}
              onClick={() => { setActiveFolder('personal'); setSidebarTab('chats'); }}>
              <div className="folder-icon-wrap">
                <span className="folder-badge">1</span>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <span className="folder-label">Shaxsiy</span>
            </div>

            {/* O'qilmagan Folder */}
            <div className={`folder-item ${activeFolder === 'unread' ? 'active' : ''}`}
              onClick={() => { setActiveFolder('unread'); setSidebarTab('chats'); }}>
              <div className="folder-icon-wrap">
                <span className="folder-badge">28</span>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <span className="folder-label">O'qilmagan</span>
            </div>

            {/* Prognozlar Folder */}
            <div className={`folder-item ${activeFolder === 'predictions' ? 'active' : ''}`}
              onClick={() => { setActiveFolder('predictions'); setSidebarTab('chats'); }}>
              <div className="folder-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <span className="folder-label">Прогнозы</span>
            </div>
          </div>

          {/* Menu toggler at bottom */}
          <div className="folder-bottom">
            <div className="folder-item settings-btn" onClick={() => setMenu(!menuOpen)}>
              <div className="folder-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="21" x2="4" y2="14" />
                  <line x1="4" y1="10" x2="4" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12" y2="3" />
                  <line x1="20" y1="21" x2="20" y2="16" />
                  <line x1="20" y1="12" x2="20" y2="3" />
                  <line x1="1" y1="14" x2="7" y2="14" />
                  <line x1="9" y1="8" x2="15" y2="8" />
                  <line x1="17" y1="16" x2="23" y2="16" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* ── 2. Main Chat Sidebar List (Right Side) ── */}
        <div className="chat-sidebar-list-wrap">
          {/* Header */}
          <div className="sidebar-header">
            <div style={{ width: 28 }} />
            <span className="sidebar-header-title">
              {sidebarTab === 'chats' ? 'Chats' : 'Calls'}
            </span>
            <button className="icon-btn compose-btn" onClick={() => setNewChatOpen(true)} title="Yangi chat">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          </div>

          {/* TAB 1: Chats */}
          {sidebarTab === 'chats' && (
            <>
              {/* Stories horizontal slider bar (matching user's stories list) */}
              {STORIES_DATA.length > 0 && (
                <div className="stories-container">
                  {STORIES_DATA.map((s, index) => (
                    <div key={s.id} className="story-item" onClick={() => {
                      setSelectedStoryIndex(index);
                      setActiveMediaIndex(0);
                      setStoryProgress(0);
                    }}>
                      <div className="story-avatar-wrap">
                        <div className="story-avatar-border">
                          {s.id === 'asad' ? (
                            <img src={s.avatar} alt="Asad" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <img src={s.avatar} alt={s.name} style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }} />
                          )}
                        </div>
                      </div>
                      <span className="story-name">{s.name.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Search Bar */}
              <div className="search-bar">
                <div className="search-input-wrap">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input className="search-input" placeholder="Search (⌘K)"
                    value={search} onChange={e => setSearch(e.target.value)} />
                  {search && (
                    <button className="icon-btn clear-search" style={{ width: 20, height: 20 }} onClick={() => setSearch('')}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Dialog List */}
              <div className="dialog-list">
                {loading ? (
                  <SkeletonList />
                ) : filtered.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    {search ? 'Topilmadi' : 'Chatlar yo\'q'}
                  </div>
                ) : (
                  filtered.map(d => (
                    <DialogItem key={d.id} dialog={d}
                      isActive={d.id === activeChatId}
                      onClick={() => openChat(d)} />
                  ))
                )}
              </div>
            </>
          )}

          {/* TAB 2: Calls History */}
          {sidebarTab === 'calls' && (
            <div className="calls-list">
              {dialogs
                .filter(d => d.type === 'user' && d.name !== 'Saved Messages')
                .slice(0, 10)
                .map((d, index) => {
                  const types: ('incoming' | 'outgoing' | 'missed')[] = ['outgoing', 'missed', 'incoming'];
                  const callType = types[index % 3];
                  const dates = ['Bugun, 12:55', 'Kecha, 12:27', '26 iyun, 10:28', '24 iyun, 15:40'];
                  const callDate = dates[index % dates.length];
                  const durations = ['2 daqiqa', '', '1 daqiqa 45s', '35 soniya'];
                  const callDuration = durations[index % durations.length];

                  return (
                    <div key={d.id} className="call-item">
                      <div className="call-item-left">
                        <TelegramAvatar id={d.id} name={d.name} type={d.type} size={42} />
                        <div className="call-info">
                          <span className="call-name">{d.name}</span>
                          <div className={`call-meta ${callType === 'missed' ? 'missed' : ''}`}>
                            {callType === 'outgoing' ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="7" y1="17" x2="17" y2="7"></line>
                                <polyline points="7 7 17 7 17 17"></polyline>
                              </svg>
                            ) : callType === 'incoming' ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="17" y1="17" x2="7" y2="7"></line>
                                <polyline points="7 17 7 7 17 7"></polyline>
                              </svg>
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                              </svg>
                            )}
                            <span>{callDate} {callDuration ? `(${callDuration})` : ''}</span>
                          </div>
                        </div>
                      </div>
                      <button className="call-action-btn" onClick={() => startCall(d.id)} title="Qayta qo'ng'iroq">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Bottom Menu Navigation */}
          <div className="bottom-nav">
            {/* Contacts Silhouette grid button */}
            <button className="nav-item-btn" onClick={() => setMenu(!menuOpen)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </button>

            {/* Calls Tab Trigger */}
            <button className={`nav-item-btn ${sidebarTab === 'calls' ? 'active' : ''}`}
              onClick={() => setSidebarTab('calls')}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </button>

            {/* Chats Tab Trigger */}
            <button className={`nav-item-btn ${sidebarTab === 'chats' ? 'active' : ''}`}
              onClick={() => { setSidebarTab('chats'); setActiveFolder('all'); }}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>

            {/* Settings Trigger */}
            <button className="nav-item-btn" onClick={() => router.push('/settings')}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Story Viewer Fullscreen Modal (Telegram 1:1) ── */}
      {selectedStoryIndex !== null && activeStory && (
        <div className="story-viewer-backdrop" onClick={closeStoryViewer}>
          <div className="story-viewer-window" onClick={e => e.stopPropagation()}>
            
            {/* Click handlers on left/right edges for story navigation */}
            <div className="story-viewer-nav-left" onClick={handlePrevStory} />
            <div className="story-viewer-nav-right" onClick={handleNextStory} />

            {/* Segment progress indicators */}
            <div className="story-viewer-progress-bars">
              {activeStory.media.map((_, i) => (
                <div key={i} className="story-viewer-progress-track">
                  <div className="story-viewer-progress-fill"
                    style={{
                      width: i < activeMediaIndex ? '100%' : i === activeMediaIndex ? `${storyProgress}%` : '0%',
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Header info (Name, timestamp, actions) */}
            <div className="story-viewer-header">
              <div className="story-viewer-user">
                <div className="story-viewer-avatar-wrap">
                  <img src={activeStory.avatar} alt={activeStory.name} />
                </div>
                <div className="story-viewer-user-info">
                  <span className="story-viewer-name">{activeStory.name}</span>
                  <span className="story-viewer-time">{activeStory.timestamp}</span>
                </div>
              </div>
              <div className="story-viewer-actions">
                <button className="story-viewer-btn" title="Sozlamalar">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
                  </svg>
                </button>
                <button className="story-viewer-btn" onClick={closeStoryViewer} title="Yopish">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Story Image Content */}
            <div className="story-viewer-media">
              <img className="story-viewer-img" src={activeStory.media[activeMediaIndex]} alt="Story media content" />
            </div>

            {/* Footer options (reply, like, share) */}
            <div className="story-viewer-footer">
              <div className="story-viewer-input-wrap">
                <input
                  type="text"
                  className="story-viewer-input"
                  placeholder="Reply Privately..."
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                />
                {/* Paperclip reply media icon */}
                <div className="story-viewer-input-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </div>
              </div>

              {/* Heart (Like) button */}
              <button
                className={`story-viewer-icon-btn ${isLiked ? 'liked' : ''}`}
                onClick={() => setIsLiked(!isLiked)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>

              {/* Share story button */}
              <button className="story-viewer-icon-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Menu Dropdown ─────────────────────── */}
      {menuOpen && (
        <>
          <div onClick={() => setMenu(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 59 }} />
          <div className="context-menu" style={{ position: 'fixed', bottom: 60, left: 16, zIndex: 60 }}>
            <div className="context-menu-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>{user?.firstName} {user?.lastName}</span>
            </div>
            <div style={{ height: 1, background: 'var(--divider)' }} />
            <div className="context-menu-item" onClick={() => { router.push('/settings'); setMenu(false); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>Sozlamalar</span>
            </div>
            <div className="context-menu-item danger" onClick={async () => { await logout(); router.replace('/login'); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>Chiqish</span>
            </div>
          </div>
        </>
      )}

      {/* ── New Chat Modal ────────────────────── */}
      {newChatOpen && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
        }} onClick={() => { setNewChatOpen(false); setSearchError(''); setSearchQuery(''); }}>
          <div className="modal-content" style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            width: '100%',
            maxWidth: 400,
            padding: 24,
            boxShadow: 'var(--shadow-lg)',
            margin: '0 16px',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>Yangi chat boshlash</h2>
            <form onSubmit={handleStartNewChat}>
              <div className="field-group" style={{ marginBottom: 16 }}>
                <label className="field-label" style={{ display: 'block', fontSize: 12, marginBottom: 6, color: 'var(--text-secondary)' }}>Username, telefon raqam yoki ID</label>
                <input
                  type="text"
                  className="field-input"
                  placeholder="Masalan: @durov yoki +998901234567"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {searchError && (
                <div style={{
                  padding: '10px 12px',
                  background: 'rgba(229, 57, 53, 0.1)',
                  border: '1px solid rgba(229, 57, 53, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--error)',
                  fontSize: 12,
                  marginBottom: 16,
                }}>
                  ⚠️ {searchError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { setNewChatOpen(false); setSearchError(''); setSearchQuery(''); }}
                  style={{ width: 'auto', padding: '8px 16px' }}
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={searchLoading || !searchQuery.trim()}
                  style={{ width: 'auto', padding: '8px 16px' }}
                >
                  {searchLoading ? 'Qidirilmoqda...' : 'Suhbat boshlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ── DialogItem (Telegram 1:1 Look override) ──────────────────
function DialogItem({ dialog, isActive, onClick }: {
  dialog: Dialog; isActive: boolean; onClick: () => void;
}) {
  const time = formatTime(dialog.lastMessageDate);

  return (
    <div className={`dialog-item ${isActive ? 'active' : ''}`} onClick={onClick}>
      <TelegramAvatar id={dialog.id} name={dialog.name} type={dialog.type} isOnline={dialog.online} size={46} />

      <div className="dialog-content">
        <div className="dialog-top">
          <span className="dialog-name">
            {dialog.name}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {dialog.lastMessageIsOutgoing && (
              <span className={`ticks-wrap ${dialog.lastMessageRead ? 'read' : 'sent'}`}>
                {dialog.lastMessageRead ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                    <polyline points="20 12 9 23 4 18" style={{ transform: 'translateY(-6px)' }} />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
            )}
            <span className={`dialog-time ${dialog.unreadCount > 0 ? 'unread' : ''}`}>{time}</span>
          </div>
        </div>

        <div className="dialog-bottom">
          {dialog.lastMessageIsDocument ? (
            <span className="dialog-last-msg document-msg">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              {dialog.lastMessage}
            </span>
          ) : (
            <span className="dialog-last-msg">
              {dialog.lastMessage ||
                (dialog.isChannel ? 'Kanal' : dialog.isGroup ? 'Guruh' : 'Yangi chat')}
            </span>
          )}

          {dialog.unreadCount > 0 ? (
            <span className={`unread-badge ${dialog.isMuted ? 'muted' : ''}`}>
              {dialog.unreadCount > 99 ? '99+' : dialog.unreadCount}
            </span>
          ) : dialog.isPinned ? (
            <span className="pin-marker">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Skeleton List ──────────────────────────────────────────
function SkeletonList() {
  return (
    <>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="dialog-item" style={{ pointerEvents: 'none', padding: '8px 12px' }}>
          <div className="skeleton" style={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="skeleton" style={{ height: 12, width: '45%', borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 10, width: '75%', borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </>
  );
}
