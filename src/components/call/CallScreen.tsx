'use client';

import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';

export default function CallScreen() {
  const { activeCall, setActiveCall } = useAppStore();
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [status, setStatus] = useState<'calling' | 'active' | 'ended'>('calling');
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!activeCall) return;
    setStatus(activeCall.status as 'calling' | 'active' | 'ended');

    // Simulate connecting after 2s
    const connectTimer = setTimeout(() => {
      setStatus('active');
      timerRef.current = setInterval(() => {
        setCallDuration((d) => d + 1);
      }, 1000);

      // Start camera if video call
      if (activeCall.type === 'video') {
        navigator.mediaDevices
          .getUserMedia({ video: true, audio: true })
          .then((stream) => {
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = stream;
            }
          })
          .catch(console.error);
      }
    }, 2000);

    return () => {
      clearTimeout(connectTimer);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeCall]);

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function endCall() {
    if (timerRef.current) clearInterval(timerRef.current);
    // Stop streams
    if (localVideoRef.current?.srcObject) {
      (localVideoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
    }
    setActiveCall(null);
  }

  if (!activeCall) return null;

  const isVideo = activeCall.type === 'video';

  return (
    <div className="call-screen">
      {/* Video background */}
      {isVideo && (
        <>
          <video
            ref={remoteVideoRef}
            className="call-video-bg"
            autoPlay
            playsInline
            muted={false}
            style={{ objectFit: 'cover' }}
          />
          <div className="call-overlay" />
          {/* Local video pip */}
          <div style={{
            position: 'absolute',
            top: 100,
            right: 20,
            width: 100,
            height: 140,
            borderRadius: 12,
            overflow: 'hidden',
            zIndex: 3,
            border: '2px solid rgba(255,255,255,0.3)',
            background: '#1A1A2E',
          }}>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
            />
          </div>
        </>
      )}

      {/* Caller info */}
      <div className="call-content">
        <div style={{
          width: 100,
          height: 100,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #2AABEE, #1A8FC4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 36,
          fontWeight: 700,
          color: 'white',
          border: '3px solid rgba(255,255,255,0.3)',
          ...(isVideo ? { display: 'none' } : {}),
        }}>
          {(activeCall.peerName[0] || '?').toUpperCase()}
        </div>

        <div className="call-name">{activeCall.peerName}</div>
        <div className="call-status">
          {status === 'calling' ? (
            <CallingDots />
          ) : status === 'active' ? (
            formatDuration(callDuration)
          ) : (
            'Qo\'ng\'iroq tugadi'
          )}
        </div>

        {/* Signal indicator */}
        {status === 'active' && (
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
            {[3, 6, 9, 12, 15].map((h, i) => (
              <div key={i} style={{
                width: 3,
                height: h,
                borderRadius: 2,
                background: i < 4 ? 'var(--online)' : 'rgba(255,255,255,0.3)',
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ position: 'relative', zIndex: 2, width: '100%' }}>
        {/* Top controls */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 24 }}>
          {isVideo && (
            <CallControlBtn
              label={isCameraOn ? 'Kamera' : 'Kamera off'}
              icon={isCameraOn ? <CameraOnIcon /> : <CameraOffIcon />}
              active={!isCameraOn}
              onClick={() => setIsCameraOn(!isCameraOn)}
            />
          )}
          <CallControlBtn
            label={isMuted ? 'Ovoz off' : 'Mikrofon'}
            icon={isMuted ? <MicOffIcon /> : <MicOnIcon />}
            active={isMuted}
            onClick={() => setIsMuted(!isMuted)}
          />
          <CallControlBtn
            label={isSpeaker ? 'Dinamik' : 'Quloqchin'}
            icon={isSpeaker ? <SpeakerIcon /> : <HeadphoneIcon />}
            active={false}
            onClick={() => setIsSpeaker(!isSpeaker)}
          />
          {isVideo && (
            <CallControlBtn
              label="Kamera al."
              icon={<FlipCameraIcon />}
              active={false}
              onClick={() => {}}
            />
          )}
        </div>

        {/* End call */}
        <div className="call-controls">
          <button
            className="call-btn end-call"
            onClick={endCall}
            style={{ boxShadow: '0 4px 20px rgba(229, 57, 53, 0.5)' }}
          >
            <EndCallIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function CallControlBtn({
  label, icon, active, onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <button
        onClick={onClick}
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          background: active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.15)',
          color: active ? '#17212B' : 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        {icon}
      </button>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function CallingDots() {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      Ulanmoqda
      <span style={{ display: 'flex', gap: 2 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{
            width: 4, height: 4, borderRadius: '50%',
            background: 'rgba(255,255,255,0.7)',
            animation: `dot-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </span>
    </span>
  );
}

// Icons
function MicOnIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>; }
function MicOffIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>; }
function SpeakerIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>; }
function HeadphoneIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>; }
function CameraOnIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>; }
function CameraOffIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06A4 4 0 1 1 7.72 7.72"/></svg>; }
function FlipCameraIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="7" r="3"/><circle cx="7" cy="17" r="3"/></svg>; }
function EndCallIcon() { return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.26 9.91a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 3.17 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11z"/><line x1="23" y1="1" x2="1" y2="23"/></svg>; }
