'use client';

import { useEffect, useState } from 'react';
import { downloadProfilePhoto } from '@/lib/telegram/media';

const GRADS = [
  'avatar-gradient-1', 'avatar-gradient-2', 'avatar-gradient-3',
  'avatar-gradient-4', 'avatar-gradient-5', 'avatar-gradient-6',
  'avatar-gradient-7', 'avatar-gradient-8',
];

function getGrad(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i);
  return GRADS[Math.abs(h) % GRADS.length];
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

interface TelegramAvatarProps {
  id: string;
  name: string;
  type: 'user' | 'group' | 'channel' | 'bot';
  isOnline?: boolean;
  size?: number;
}

export default function TelegramAvatar({ id, name, type, isOnline, size = 54 }: TelegramAvatarProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState(false);
  const grad = getGrad(id);

  useEffect(() => {
    setPhotoUrl(null);
    setPhotoErr(false);
    downloadProfilePhoto(id)
      .then(url => { if (url) setPhotoUrl(url); })
      .catch(() => {});
  }, [id]);

  const showPhoto = photoUrl && !photoErr;

  return (
    <div className={`dialog-avatar ${grad}`}
      style={{ width: size, height: size, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
      {showPhoto ? (
        <img src={photoUrl} alt={name}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setPhotoErr(true)}
        />
      ) : type === 'channel' ? (
        <span style={{ fontSize: size * 0.4 }}>📢</span>
      ) : type === 'group' ? (
        <span style={{ fontSize: size * 0.4 }}>👥</span>
      ) : type === 'bot' ? (
        <span style={{ fontSize: size * 0.4 }}>🤖</span>
      ) : (
        <span style={{ fontSize: size * 0.35 }}>{getInitials(name)}</span>
      )}
      {isOnline && <span className="online-dot" />}
    </div>
  );
}
