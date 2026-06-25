'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/telegram/auth';
import { useAppStore } from '@/lib/store';
import Sidebar from '@/components/chat/Sidebar';
import ChatArea from '@/components/chat/ChatArea';
import CallScreen from '@/components/call/CallScreen';

export default function ChatsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { activeCall, isConnected } = useAppStore();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="chat-area">
        {children}
      </main>
      {activeCall && <CallScreen />}
    </div>
  );
}
