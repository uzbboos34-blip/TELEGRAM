'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import {
  getDialogs, Dialog,
  getStories, getCallHistory,
  TelegramStoryItem, TelegramCallItem
} from '@/lib/telegram/dialogs';
import { logout, getCurrentUser } from '@/lib/telegram/auth';
import { downloadStoryMedia, downloadProfilePhoto } from '@/lib/telegram/media';
import { phoneCallManager } from '@/lib/webrtc/call-manager';
import TelegramAvatar from './TelegramAvatar';

function formatTime(ts?: number) {
  if (!ts) return '';
  const d = new Date(ts * 1000), now = new Date(), diff = now.getTime() - d.getTime();
  const day = 86400000;
  if (diff < day) return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  if (diff < 7 * day) return d.toLocaleDateString('ru', { weekday: 'short' });
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' });
}

// Fallback high-fidelity mocks matching Screenshot 1
const MOCK_STORIES: TelegramStoryItem[] = [
  { id: 'asad', storyId: 9991, name: 'Hikoyam', avatar: '/stories/asad_avatar.png', media: '/stories/asad_content.png', timestamp: '12 soat oldin', hasUnread: true },
  { id: 'husnid', storyId: 9992, name: 'Husnid', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', media: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=600', timestamp: '5 soat oldin', hasUnread: true },
  { id: 'laboy', storyId: 9993, name: 'Labo\'y', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', media: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=600', timestamp: '2 soat oldin', hasUnread: true },
  { id: 'ilhom', storyId: 9994, name: 'ILHOM', avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150', media: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600', timestamp: '10 soat oldin', hasUnread: true },
  { id: 'tumur', storyId: 9995, name: 'Tumur', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150', media: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=600', timestamp: '1 kun oldin', hasUnread: true }
];

export default function Sidebar() {
  const router = useRouter();
  const {
    dialogs, setDialogs, activeChatId,
    setActiveChat, sidebarOpen, setSidebarOpen,
    theme, toggleTheme
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenu] = useState(false);
  const user = getCurrentUser();

  // Unified Mobile Tabs: chats, contacts, settings, profile
  const [sidebarTab, setSidebarTab] = useState<'chats' | 'contacts' | 'settings' | 'profile'>('chats');
  const [activeFolder, setActiveFolder] = useState<'all' | 'personal' | 'unread' | 'predictions'>('all');

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [stories, setStories] = useState<TelegramStoryItem[]>([]);
  const [calls, setCalls] = useState<TelegramCallItem[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(true);

  const [selectedStoryIndex, setSelectedStoryIndex] = useState<number | null>(null);
  const [storyProgress, setStoryProgress] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  const [downloadedMediaUrl, setDownloadedMediaUrl] = useState<string | null>(null);
  const [mediaDownloading, setMediaDownloading] = useState(false);
  const progressIntervalRef = useRef<any>(null);

  const [contactsSearch, setContactsSearch] = useState('');

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

  const loadStories = useCallback(async () => {
    setStoriesLoading(true);
    try {
      const apiStories = await getStories();
      const storiesWithAvatars = await Promise.all(
        apiStories.map(async (story) => {
          const photoUrl = await downloadProfilePhoto(story.id);
          return {
            ...story,
            avatar: photoUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          };
        })
      );
      if (storiesWithAvatars.length > 0) {
        setStories(storiesWithAvatars);
      } else {
        setStories(MOCK_STORIES);
      }
    } catch (e) {
      console.error('[Sidebar] loadStories:', e);
      setStories(MOCK_STORIES);
    } finally {
      setStoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDialogs();
    loadStories();
  }, [loadDialogs, loadStories]);

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

  // Story Viewer Player Loop
  const closeStoryViewer = useCallback(() => {
    setSelectedStoryIndex(null);
    setStoryProgress(0);
    setReplyText('');
    setIsLiked(false);
    setDownloadedMediaUrl(null);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
  }, []);

  const handleNextStory = useCallback(() => {
    if (selectedStoryIndex === null) return;
    if (selectedStoryIndex < stories.length - 1) {
      setSelectedStoryIndex(prev => (prev as number) + 1);
      setStoryProgress(0);
      setDownloadedMediaUrl(null);
    } else {
      closeStoryViewer();
    }
  }, [selectedStoryIndex, stories.length, closeStoryViewer]);

  const handlePrevStory = useCallback(() => {
    if (selectedStoryIndex === null) return;
    if (selectedStoryIndex > 0) {
      setSelectedStoryIndex(prev => (prev as number) - 1);
      setStoryProgress(0);
      setDownloadedMediaUrl(null);
    } else {
      setStoryProgress(0);
    }
  }, [selectedStoryIndex]);

  useEffect(() => {
    if (selectedStoryIndex === null) return;
    const currentStory = stories[selectedStoryIndex];
    if (!currentStory) return;

    if (typeof currentStory.media === 'string') {
      setDownloadedMediaUrl(currentStory.media);
      setMediaDownloading(false);
      return;
    }

    setMediaDownloading(true);
    setDownloadedMediaUrl(null);
    downloadStoryMedia(currentStory.id, currentStory.storyId, currentStory.media)
      .then((url) => {
        setDownloadedMediaUrl(url || 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600');
      })
      .catch(() => {
        setDownloadedMediaUrl('https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600');
      })
      .finally(() => {
        setMediaDownloading(false);
      });
  }, [selectedStoryIndex, stories]);

  useEffect(() => {
    if (selectedStoryIndex === null || mediaDownloading || !downloadedMediaUrl) return;
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
  }, [selectedStoryIndex, mediaDownloading, downloadedMediaUrl, handleNextStory]);

  const activeStory = selectedStoryIndex !== null ? stories[selectedStoryIndex] : null;

  // Extract contact list based on dialogs cache
  const contactPeers = dialogs.filter(d => d.type === 'user');
  const filteredContacts = contactPeers.filter(c =>
    c.name.toLowerCase().includes(contactsSearch.toLowerCase())
  );

  return (
    <>
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 49 }}
          className="mobile-overlay" />
      )}

      {/* Main Sidebar Component - clean width on desktop */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} style={{ display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '380px' }}>
        
        {/* Container for active view */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* ──────────────── TAB 1: CHATS ──────────────── */}
          {sidebarTab === 'chats' && (
            <>
              {/* Header */}
              <div className="sidebar-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button className="icon-btn" onClick={() => setMenu(!menuOpen)}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                  </button>
                  <span className="sidebar-header-title">Telegram</span>
                </div>
                <button className="icon-btn" onClick={() => setNewChatOpen(true)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                </button>
              </div>

              {/* Stories Bar */}
              {stories.length > 0 && (
                <div className="stories-container">
                  {/* Hikoyam user trigger at first index */}
                  {stories.map((s, index) => (
                    <div key={s.id} className="story-item" onClick={() => {
                      setSelectedStoryIndex(index);
                      setStoryProgress(0);
                    }}>
                      <div className="story-avatar-wrap">
                        {/* Ring border: has green color */}
                        <div className="story-avatar-border" style={{ borderColor: '#0088cc' }}>
                          <img src={s.avatar} alt={s.name} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
                          {s.id === 'asad' && (
                            <span style={{ position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: '50%', background: '#0088cc', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 'bold' }}>+</span>
                          )}
                        </div>
                      </div>
                      <span className="story-name" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Search bar */}
              <div className="search-bar">
                <div className="search-input-wrap">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input className="search-input" placeholder="Chatlarni qidirish"
                    value={search} onChange={e => setSearch(e.target.value)} />
                  {search && (
                    <button className="icon-btn clear-search" onClick={() => setSearch('')}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Horizontal Folders Tab Bar (Scrollable) */}
              <div className="folders-horizontal-scroll">
                <button className={`folder-tab-pill ${activeFolder === 'all' ? 'active' : ''}`} onClick={() => setActiveFolder('all')}>
                  Hamma chatlar <span className="folder-tab-badge">25</span>
                </button>
                <button className={`folder-tab-pill ${activeFolder === 'personal' ? 'active' : ''}`} onClick={() => setActiveFolder('personal')}>
                  Shaxsiy
                </button>
                <button className={`folder-tab-pill ${activeFolder === 'unread' ? 'active' : ''}`} onClick={() => setActiveFolder('unread')}>
                  O&apos;qilmagan <span className="folder-tab-badge muted">27</span>
                </button>
                <button className={`folder-tab-pill ${activeFolder === 'predictions' ? 'active' : ''}`} onClick={() => setActiveFolder('predictions')}>
                  Prognozlar
                </button>
              </div>

              {/* Chat List Items */}
              <div className="dialog-list" style={{ flex: 1, overflowY: 'auto' }}>
                {loading ? (
                  <SkeletonList />
                ) : filtered.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Topilmadi
                  </div>
                ) : (
                  filtered.map(d => (
                    <DialogItem key={d.id} dialog={d} isActive={d.id === activeChatId} onClick={() => openChat(d)} />
                  ))
                )}
              </div>

              {/* Floating Action Button (FAB) compose pencil */}
              <button className="input-send-circle-btn" onClick={() => setNewChatOpen(true)}
                style={{ position: 'absolute', bottom: 76, right: 16, zIndex: 10 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                </svg>
              </button>
            </>
          )}

          {/* ──────────────── TAB 2: CONTACTS ──────────────── */}
          {sidebarTab === 'contacts' && (
            <>
              {/* Header */}
              <div className="sidebar-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="sidebar-header-title" style={{ fontSize: 20 }}>Kontaktlar</span>
                </div>
                <button className="icon-btn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                </button>
              </div>

              {/* Search Contacts */}
              <div className="search-bar">
                <div className="search-input-wrap">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input className="search-input" placeholder="Kontaktlarni qidirish"
                    value={contactsSearch} onChange={e => setContactsSearch(e.target.value)} />
                </div>
              </div>

              {/* Special options matching Screenshot 7 */}
              <div className="dialog-list" style={{ flex: 1, overflowY: 'auto' }}>
                <div className="contact-row-special">
                  <div className="contact-special-icon" style={{ background: '#2aabee' }}>
                    👤
                  </div>
                  <span className="contact-special-text">Tanishlarni taklif qilish</span>
                </div>
                <div className="contact-row-special">
                  <div className="contact-special-icon" style={{ background: '#4caf50' }}>
                    📞
                  </div>
                  <span className="contact-special-text">Oxirgi chaqiruvlar</span>
                </div>

                <div className="contacts-sort-label">Oxirgi faollik bo&apos;yicha tartiblash</div>

                {filteredContacts.map(c => (
                  <div key={c.id} className="contact-row-special" onClick={() => openChat(c)}>
                    <TelegramAvatar id={c.id} name={c.name} type="user" isOnline={c.online} size={40} />
                    <div>
                      <div style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--text-primary)' }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {c.online ? 'onlayn' : 'yaqinda onlayn edi'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* FAB Contact add button */}
              <button className="input-send-circle-btn" style={{ position: 'absolute', bottom: 76, right: 16, zIndex: 10 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="16" y1="11" x2="22" y2="11" />
                </svg>
              </button>
            </>
          )}

          {/* ──────────────── TAB 3: SETTINGS ──────────────── */}
          {sidebarTab === 'settings' && (
            <>
              {/* Header */}
              <div className="sidebar-header">
                <span className="sidebar-header-title">Sozlamalar</span>
                <button className="icon-btn" onClick={toggleTheme}>
                  ☀️
                </button>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                {/* Profile Card matching Screenshot 4 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, background: '#17212b', borderRadius: 12, marginBottom: 16 }}>
                  <div className="dialog-avatar avatar-gradient-5" style={{ width: 60, height: 60, fontSize: 22, fontWeight: 'bold' }}>
                    R
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'white' }}>Rahmonbergan_oo4</div>
                    <div style={{ fontSize: 12.5, color: '#2aabee', marginTop: 3 }}>+998 907012161 • @Rahmonbergan_oo4</div>
                  </div>
                </div>

                {/* Settings menu blocks matching Screenshot 4 */}
                <div style={{ display: 'flex', flexDirection: 'column', background: '#17212b', borderRadius: 12, overflow: 'hidden' }}>
                  
                  <div className="contact-row-special">
                    <div className="contact-special-icon" style={{ background: '#2aabee' }}>👤</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'white' }}>Hisob</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>Raqam, foydalanuvchi nomi, tarjimayi hol</div>
                    </div>
                  </div>

                  <div className="contact-row-special" onClick={toggleTheme}>
                    <div className="contact-special-icon" style={{ background: '#ffa726' }}>💬</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'white' }}>Chat sozlamalari</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>Fon rasmi, tungi rejim, animatsiyalar</div>
                    </div>
                  </div>

                  <div className="contact-row-special">
                    <div className="contact-special-icon" style={{ background: '#4caf50' }}>🔐</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'white' }}>Maxfiylik va xavfsizlik</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>Oxirgi faollik, qurilmalar, kirish kalitlari</div>
                    </div>
                  </div>

                  <div className="contact-row-special">
                    <div className="contact-special-icon" style={{ background: '#f44336' }}>🔔</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'white' }}>Bildirishnomalar</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>Tovushlar, chaqiruvlar, nishonlar</div>
                    </div>
                  </div>

                  <div className="contact-row-special">
                    <div className="contact-special-icon" style={{ background: '#2196f3' }}>📊</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'white' }}>Ma&apos;lumotlar va xotira</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>Media yuklab olish sozlamalari</div>
                    </div>
                  </div>

                  <div className="contact-row-special">
                    <div className="contact-special-icon" style={{ background: '#00bcd4' }}>📁</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'white' }}>Chat jildlari</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>Chatlarni jildlarga saralash</div>
                    </div>
                  </div>

                  <div className="contact-row-special">
                    <div className="contact-special-icon" style={{ background: '#795548' }}>💻</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'white' }}>Qurilmalar</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>Ulangan qurilmalarni boshqarish</div>
                    </div>
                  </div>

                  <div className="contact-row-special" style={{ color: 'var(--error)' }} onClick={async () => { await logout(); router.replace('/login'); }}>
                    <div className="contact-special-icon" style={{ background: 'var(--error)' }}>🚪</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--error)' }}>Tizimdan chiqish</div>
                    </div>
                  </div>

                </div>
              </div>
            </>
          )}

          {/* ──────────────── TAB 4: PROFILE ──────────────── */}
          {sidebarTab === 'profile' && (
            <>
              {/* Header */}
              <div className="sidebar-header">
                <span className="sidebar-header-title">Profil</span>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                {/* Profile header matching Screenshot 5 */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 100, height: 100, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, color: 'white', fontWeight: 'bold', overflow: 'hidden', position: 'relative' }}>
                    R
                    <span style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%', background: '#0088cc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>📷</span>
                  </div>
                  <span style={{ fontSize: 18, fontWeight: 'bold', color: 'white', marginTop: 12 }}>Rahmonbergan_oo4</span>
                  <span style={{ fontSize: 13, color: '#4caf50', marginTop: 4 }}>onlayn</span>
                </div>

                {/* Profile actions */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '16px 0' }}>
                  <button className="btn btn-primary" style={{ fontSize: 12.5, padding: '8px 12px' }}>Rasm belgilash</button>
                  <button className="btn btn-ghost" style={{ fontSize: 12.5, padding: '8px 12px', border: '1px solid var(--border)' }}>Axborotni tahrirlash</button>
                </div>

                {/* Info blocks card matching Screenshot 5 */}
                <div style={{ display: 'flex', flexDirection: 'column', background: '#17212b', borderRadius: 12, padding: '6px 0' }}>
                  
                  <div className="contact-row-special">
                    <div className="contact-special-icon" style={{ background: '#2aabee' }}>📞</div>
                    <div>
                      <div style={{ fontSize: 14, color: 'white', fontWeight: 500 }}>+998 907012161</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>Mobil raqam</div>
                    </div>
                  </div>

                  <div className="contact-row-special">
                    <div className="contact-special-icon" style={{ background: '#9c27b0' }}>📧</div>
                    <div>
                      <div style={{ fontSize: 14, color: 'white', fontWeight: 500 }}>@Rahmonbergan_oo4</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>Foydalanuvchi nomi</div>
                    </div>
                  </div>

                  <div className="contact-row-special">
                    <div className="contact-special-icon" style={{ background: '#ff9800' }}>🎂</div>
                    <div>
                      <div style={{ fontSize: 14, color: 'white', fontWeight: 500 }}>dek 12, 2004 (21 yosh)</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>Tug&apos;ilgan kun</div>
                    </div>
                  </div>

                </div>
              </div>
            </>
          )}

          {/* ── Global Bottom Navigation Bar (Matching Screenshots 1, 4, 5, 7) ── */}
          <div className="bottom-nav">
            
            {/* Chats tab */}
            <button className={`nav-item-btn ${sidebarTab === 'chats' ? 'active' : ''}`} onClick={() => setSidebarTab('chats')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill={sidebarTab === 'chats' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span style={{ fontSize: 10, marginTop: 3 }}>Chatlar</span>
              {/* Optional unread count badge */}
              <span className="folder-tab-badge" style={{ position: 'absolute', top: 4, right: 26, fontSize: 8.5, padding: '1px 4px' }}>25</span>
            </button>

            {/* Contacts tab */}
            <button className={`nav-item-btn ${sidebarTab === 'contacts' ? 'active' : ''}`} onClick={() => setSidebarTab('contacts')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill={sidebarTab === 'contacts' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              </svg>
              <span style={{ fontSize: 10, marginTop: 3 }}>Kontaktlar</span>
            </button>

            {/* Settings tab */}
            <button className={`nav-item-btn ${sidebarTab === 'settings' ? 'active' : ''}`} onClick={() => setSidebarTab('settings')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span style={{ fontSize: 10, marginTop: 3 }}>Sozlamalar</span>
            </button>

            {/* Profile tab */}
            <button className={`nav-item-btn ${sidebarTab === 'profile' ? 'active' : ''}`} onClick={() => setSidebarTab('profile')}>
              <div className="dialog-avatar avatar-gradient-3" style={{ width: 22, height: 22, fontSize: 9, fontWeight: 'bold' }}>
                R
              </div>
              <span style={{ fontSize: 10, marginTop: 3 }}>Profil</span>
            </button>

          </div>

        </div>
      </aside>

      {/* ── Story Viewer ── */}
      {selectedStoryIndex !== null && activeStory && (
        <div className="story-viewer-backdrop" onClick={closeStoryViewer}>
          <div className="story-viewer-window" onClick={e => e.stopPropagation()}>
            <div className="story-viewer-nav-left" onClick={handlePrevStory} />
            <div className="story-viewer-nav-right" onClick={handleNextStory} />

            <div className="story-viewer-progress-bars">
              <div className="story-viewer-progress-track">
                <div className="story-viewer-progress-fill" style={{ width: `${storyProgress}%` }} />
              </div>
            </div>

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
                <button className="story-viewer-btn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
                </button>
                <button className="story-viewer-btn" onClick={closeStoryViewer}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            </div>

            <div className="story-viewer-media">
              {mediaDownloading ? (
                <div style={{ color: 'white', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                  <div className="spinner" style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Yuklanmoqda...</span>
                </div>
              ) : downloadedMediaUrl ? (
                <img className="story-viewer-img" src={downloadedMediaUrl} alt="Story content" />
              ) : (
                <div style={{ color: 'white', fontSize: 13 }}>Yuklash bajarilmadi</div>
              )}
            </div>

            <div className="story-viewer-footer">
              <div className="story-viewer-input-wrap">
                <input type="text" className="story-viewer-input" placeholder="Xabarga javob yozish..." value={replyText} onChange={e => setReplyText(e.target.value)} />
                <div className="story-viewer-input-icon">📎</div>
              </div>
              <button className={`story-viewer-icon-btn ${isLiked ? 'liked' : ''}`} onClick={() => setIsLiked(!isLiked)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Context Menu ── */}
      {menuOpen && (
        <>
          <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 59 }} />
          <div className="context-menu" style={{ position: 'fixed', top: 60, left: 16, zIndex: 60 }}>
            <div className="context-menu-item" onClick={() => { setSidebarTab('profile'); setMenu(false); }}>
              👤 Mening profilim
            </div>
            <div className="context-menu-item" onClick={() => { setSidebarTab('settings'); setMenu(false); }}>
              ⚙️ Sozlamalar
            </div>
            <div className="context-menu-item danger" onClick={async () => { await logout(); router.replace('/login'); }}>
              🚪 Chiqish
            </div>
          </div>
        </>
      )}

      {/* ── New Chat Start Modal ── */}
      {newChatOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => { setNewChatOpen(false); setSearchError(''); setSearchQuery(''); }}>
          <div className="modal-content" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: 400, padding: 24, boxShadow: 'var(--shadow-lg)', margin: '0 16px' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>Yangi chat boshlash</h2>
            <form onSubmit={handleStartNewChat}>
              <div className="field-group" style={{ marginBottom: 16 }}>
                <label className="field-label" style={{ display: 'block', fontSize: 12, marginBottom: 6, color: 'var(--text-secondary)' }}>Username yoki telefon raqami</label>
                <input type="text" className="field-input" placeholder="Masalan: @durov yoki +998901234567" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} autoFocus style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
              </div>

              {searchError && (
                <div style={{ padding: '10px 12px', background: 'rgba(229, 57, 53, 0.1)', border: '1px solid rgba(229, 57, 53, 0.3)', borderRadius: 'var(--radius-md)', color: 'var(--error)', fontSize: 12, marginBottom: 16 }}>
                  ⚠️ {searchError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button type="button" className="btn btn-ghost" onClick={() => { setNewChatOpen(false); setSearchError(''); setSearchQuery(''); }} style={{ width: 'auto', padding: '8px 16px' }}>Bekor qilish</button>
                <button type="submit" className="btn btn-primary" disabled={searchLoading || !searchQuery.trim()} style={{ width: 'auto', padding: '8px 16px' }}>{searchLoading ? 'Qidirilmoqda...' : 'Suhbat boshlash'}</button>
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

  // Mark if last message was document to show correct icon/text
  return (
    <div className={`dialog-item ${isActive ? 'active' : ''}`} onClick={onClick}>
      <TelegramAvatar id={dialog.id} name={dialog.name} type={dialog.type} isOnline={dialog.online} size={46} />

      <div className="dialog-content">
        <div className="dialog-top">
          <span className="dialog-name">{dialog.name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {dialog.lastMessageIsOutgoing && (
              <span className={`ticks-wrap ${dialog.lastMessageRead ? 'read' : 'sent'}`}>
                {dialog.lastMessageRead ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /><polyline points="20 12 9 23 4 18" style={{ transform: 'translateY(-6px)' }} /></svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </span>
            )}
            <span className={`dialog-time ${dialog.unreadCount > 0 ? 'unread' : ''}`}>{time}</span>
          </div>
        </div>

        <div className="dialog-bottom">
          {dialog.lastMessageIsDocument ? (
            <span className="dialog-last-msg document-msg" style={{ color: '#2aabee' }}>
              📄 {dialog.lastMessage}
            </span>
          ) : (
            <span className="dialog-last-msg">
              {dialog.lastMessage || (dialog.isChannel ? 'Kanal' : dialog.isGroup ? 'Guruh' : 'Yangi chat')}
            </span>
          )}

          {dialog.unreadCount > 0 ? (
            <span className={`unread-badge ${dialog.isMuted ? 'muted' : ''}`}>
              {dialog.unreadCount}
            </span>
          ) : dialog.isPinned ? (
            <span className="pin-marker">📌</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
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
