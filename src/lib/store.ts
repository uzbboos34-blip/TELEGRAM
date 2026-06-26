/**
 * Global State Management (Zustand)
 */

import { create } from 'zustand';
import { Dialog } from '@/lib/telegram/dialogs';
import { Message } from '@/lib/telegram/messages';
import { UserInfo } from '@/lib/telegram/auth';

interface ActiveCall {
  peerId: string;
  peerName: string;
  type: 'voice' | 'video';
  status: 'calling' | 'ringing' | 'active' | 'ended';
}

export interface IncomingCall {
  callId: string;
  peerId: string;
  peerName: string;
  isVideo: boolean;
  signal: unknown; // CallSignal from webrtc/call-manager
}

interface AppState {
  // Auth
  user: UserInfo | null;
  isAuthenticated: boolean;
  setUser: (user: UserInfo | null) => void;
  setAuthenticated: (val: boolean) => void;

  // Dialogs
  dialogs: Dialog[];
  setDialogs: (dialogs: Dialog[]) => void;
  updateDialog: (id: string, updates: Partial<Dialog>) => void;

  // Active chat
  activeChatId: string | null;
  activeChatType: 'user' | 'group' | 'channel' | null;
  activeChatName: string;
  setActiveChat: (id: string | null, type: 'user' | 'group' | 'channel' | null, name: string) => void;

  // Messages
  messages: Record<string, Message[]>;
  setMessages: (chatId: string, messages: Message[]) => void;
  addMessage: (chatId: string, message: Message) => void;
  prependMessages: (chatId: string, messages: Message[]) => void;

  // UI
  sidebarOpen: boolean;
  searchOpen: boolean;
  theme: 'dark' | 'light';
  setSidebarOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  toggleTheme: () => void;

  // Call
  activeCall: ActiveCall | null;
  setActiveCall: (call: ActiveCall | null) => void;
  incomingCall: IncomingCall | null;
  setIncomingCall: (call: IncomingCall | null) => void;

  // Connection
  isConnected: boolean;
  setConnected: (val: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Auth
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user }),
  setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),

  // Dialogs
  dialogs: [],
  setDialogs: (dialogs) => set({ dialogs }),
  updateDialog: (id, updates) =>
    set((state) => ({
      dialogs: state.dialogs.map((d) => (d.id === id ? { ...d, ...updates } : d)),
    })),

  // Active chat
  activeChatId: null,
  activeChatType: null,
  activeChatName: '',
  setActiveChat: (id, type, name) =>
    set({ activeChatId: id, activeChatType: type, activeChatName: name }),

  // Messages
  messages: {},
  setMessages: (chatId, messages) =>
    set((state) => ({ messages: { ...state.messages, [chatId]: messages } })),
  addMessage: (chatId, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [chatId]: [...(state.messages[chatId] || []), message],
      },
    })),
  prependMessages: (chatId, messages) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [chatId]: [...messages, ...(state.messages[chatId] || [])],
      },
    })),

  // UI
  sidebarOpen: true,
  searchOpen: false,
  theme: 'dark',
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  toggleTheme: () =>
    set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),

  // Call
  activeCall: null,
  setActiveCall: (activeCall) => set({ activeCall }),
  incomingCall: null,
  setIncomingCall: (incomingCall) => set({ incomingCall }),

  // Connection
  isConnected: false,
  setConnected: (isConnected) => set({ isConnected }),
}));
