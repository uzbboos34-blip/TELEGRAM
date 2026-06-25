'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/telegram/auth';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace('/chats');
    } else {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="splash-screen">
      <div className="splash-logo">
        <svg viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="120" cy="120" r="120" fill="url(#logo-gradient)" />
          <path
            d="M81.229 128.772l14.237 39.406s1.78 3.687 3.686 3.687c1.907 0 30.255-29.492 30.255-29.492l31.525-60.89L81.229 128.772z"
            fill="#C8DAEA"
          />
          <path
            d="M100.106 138.878l-2.733 29.046s-1.144 8.9 7.754 0 17.415-15.763 17.415-15.763"
            fill="#A9C9DD"
          />
          <path
            d="M81.486 130.178l-40.32-13.195s-4.83-1.956-3.284-6.396c.32-.915 1.985-1.742 5.513-3.922 16.964-10.454 139.151-52.555 139.151-52.555s4.441-1.49 7.07-.501c1.284.495 2.11 1.504 2.362 3.405.231 1.695.345 3.272.034 5.546-.025.179-35.442 104.637-35.442 104.637s-2.059 5.106-7.471 5.296c-2.016.069-4.471-.416-7.452-2.876-7.544-6.254-33.829-24.171-39.624-28.126a1.043 1.043 0 0 1-.447-.797c-.073-.523.504-1.17.504-1.17s45.729-40.603 46.981-45.109c.094-.33-.261-.492-.739-.349-3.012.903-55.233 34.115-61.084 37.842a3.09 3.09 0 0 1-1.752.27z"
            fill="white"
          />
          <defs>
            <linearGradient id="logo-gradient" x1="120" y1="0" x2="120" y2="240" gradientUnits="userSpaceOnUse">
              <stop stopColor="#2AABEE" />
              <stop offset="1" stopColor="#229ED9" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <h1 className="splash-title">Ross Messenger</h1>
      <div className="splash-loading">
        <div className="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  );
}
