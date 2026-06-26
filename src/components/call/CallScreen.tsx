'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';

// ── Avatarlar ──────────────────────────────────────────────
const GRADS = [
  '#2AABEE','#E91E63','#9C27B0','#4CAF50',
  '#FF9800','#00BCD4','#F44336','#3F51B5',
];
function getColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i);
  return GRADS[Math.abs(h) % GRADS.length];
}
function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

// ─────────────────────────────────────────────────────────
export default function CallScreen() {
  const { activeCall, setActiveCall } = useAppStore();
  const [status, setStatus]       = useState<'calling' | 'active' | 'ended'>('calling');
  const [duration, setDuration]   = useState(0);
  const [muted, setMuted]         = useState(false);
  const [speakerOn, setSpeaker]   = useState(true);
  const [camOff, setCamOff]       = useState(false);
  const [localCam, setLocalCam]   = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStream   = useRef<MediaStream | null>(null);
  const timerRef      = useRef<NodeJS.Timeout | null>(null);
  const connectRef    = useRef<NodeJS.Timeout | null>(null);

  const isVideo = activeCall?.type === 'video';

  // ── Init call ─────────────────────────────────────────
  useEffect(() => {
    if (!activeCall) return;
    setStatus('calling');
    setDuration(0);
    setMuted(false);
    setCamOff(false);
    setLocalCam(false);

    // Auto-simulate connect after 3s (real P2P call needs Telegram MTProto)
    connectRef.current = setTimeout(async () => {
      setStatus('active');
      startTimer();

      // Request camera/mic for video call
      if (isVideo) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true, audio: true,
          });
          localStream.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
          setLocalCam(true);
        } catch (e) {
          console.warn('[Call] Media access denied:', e);
          // Voice only as fallback
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStream.current = audioStream;
          } catch { /* no mic */ }
        }
      } else {
        // Voice call — get mic
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          localStream.current = stream;
        } catch { /* no mic */ }
      }
    }, 2500);

    return () => {
      if (connectRef.current) clearTimeout(connectRef.current);
      stopAll();
    };
  }, [activeCall?.peerId]); // eslint-disable-line

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  }

  function stopAll() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (connectRef.current) clearTimeout(connectRef.current);
    localStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;
    setLocalCam(false);
  }

  function endCall() {
    setStatus('ended');
    stopAll();
    setTimeout(() => setActiveCall(null), 800);
  }

  function toggleMute() {
    setMuted(m => {
      const next = !m;
      localStream.current?.getAudioTracks().forEach(t => { t.enabled = !next; });
      return next;
    });
  }

  function toggleCam() {
    setCamOff(c => {
      const next = !c;
      localStream.current?.getVideoTracks().forEach(t => { t.enabled = !next; });
      return next;
    });
  }

  function fmtDuration(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  if (!activeCall) return null;

  const color   = getColor(activeCall.peerId);
  const ini     = initials(activeCall.peerName);
  const bgColor = isVideo ? '#000' : '#17212B';

  const statusLabel =
    status === 'calling' ? 'Ulanilmoqda...' :
    status === 'active'  ? fmtDuration(duration) :
    'Tugadi';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', flexDirection: 'column',
      background: bgColor,
    }}>
      {/* ── Background gradient ─────────────────── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: isVideo
          ? 'none'
          : `radial-gradient(circle at 50% 30%, ${color}22 0%, transparent 70%)`,
      }}/>

      {/* ── Status bar ──────────────────────────── */}
      <div style={{
        position: 'relative', zIndex: 2,
        padding: '52px 24px 16px',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: 12, letterSpacing: 1.5,
          color: 'rgba(255,255,255,.55)',
          textTransform: 'uppercase', marginBottom: 6,
        }}>
          {isVideo ? '📹 Video qo\'ng\'iroq' : '📞 Ovozli qo\'ng\'iroq'}
        </div>
        <h1 style={{
          fontSize: 26, fontWeight: 700, color: '#fff',
          margin: '0 0 6px',
        }}>
          {activeCall.peerName}
        </h1>
        <div style={{
          fontSize: 15,
          color: status === 'active' ? '#4CAF50' : 'rgba(255,255,255,.6)',
          transition: 'color .4s',
          minHeight: 22,
        }}>
          {status === 'active' && (
            <span style={{
              display: 'inline-block',
              width: 8, height: 8, borderRadius: '50%',
              background: '#4CAF50', marginRight: 6,
              boxShadow: '0 0 8px #4CAF50',
              animation: 'callPulse 2s infinite',
              verticalAlign: 'middle',
            }}/>
          )}
          {statusLabel}
        </div>
      </div>

      {/* ── Center content ──────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center',
        justifyContent: 'center', position: 'relative',
      }}>
        {/* Remote video placeholder (future use) */}
        {isVideo && (
          <div style={{
            position: 'absolute', inset: 0,
            background: '#111',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {/* Remote user avatar when no video */}
            <div style={{
              width: 100, height: 100, borderRadius: '50%',
              background: color, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 36, fontWeight: 700,
              color: '#fff',
              animation: status === 'calling' ? 'callRing 1.5s ease-in-out infinite' : 'none',
              boxShadow: status === 'calling' ? `0 0 0 0 ${color}` : 'none',
            }}>
              {ini}
            </div>
          </div>
        )}

        {/* Voice call — big avatar */}
        {!isVideo && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <div style={{
              width: 120, height: 120, borderRadius: '50%',
              background: color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 44, fontWeight: 700, color: '#fff',
              boxShadow: status === 'calling'
                ? `0 0 0 0 ${color}44`
                : status === 'active'
                ? `0 0 20px ${color}66`
                : 'none',
              animation: status === 'calling' ? 'callRing 1.5s ease-in-out infinite' : 'none',
            }}>
              {ini}
            </div>

            {/* Ringtone animation (calling) */}
            {status === 'calling' && (
              <div style={{ display: 'flex', gap: 4, marginTop: 28 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} style={{
                    width: 4, height: 20, borderRadius: 2,
                    background: 'rgba(255,255,255,.35)',
                    animationName: 'soundWave',
                    animationDuration: '1.2s',
                    animationTimingFunction: 'ease-in-out',
                    animationIterationCount: 'infinite',
                    animationDelay: `${i * 0.15}s`,
                  }}/>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Local camera preview (video call) */}
        {isVideo && localCam && !camOff && (
          <div style={{
            position: 'absolute', bottom: 16, right: 16,
            width: 100, height: 140,
            borderRadius: 12, overflow: 'hidden',
            border: '2px solid rgba(255,255,255,.3)',
            background: '#000',
          }}>
            <video ref={localVideoRef} autoPlay muted playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          </div>
        )}
      </div>

      {/* ── Controls ─────────────────────────────── */}
      <div style={{
        position: 'relative', zIndex: 2,
        padding: '0 20px 48px',
      }}>
        {/* Secondary buttons */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 16,
          marginBottom: 24, flexWrap: 'wrap',
        }}>
          <CallBtn icon={muted ? '🔇' : '🎙️'} label={muted ? 'Ochiq' : 'Ovoz off'}
            active={muted} onClick={toggleMute}/>
          <CallBtn icon={speakerOn ? '🔊' : '🔈'} label="Karnay"
            active={!speakerOn} onClick={() => setSpeaker(s => !s)}/>
          {isVideo && (
            <CallBtn icon={camOff ? '📵' : '📹'} label={camOff ? 'Kamera' : 'Kamera off'}
              active={camOff} onClick={toggleCam}/>
          )}
          <CallBtn icon="💬" label="Xabar" active={false} onClick={() => {}}/>
        </div>

        {/* End Call button */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button onClick={endCall} style={{
            width: 72, height: 72, borderRadius: '50%',
            background: '#F44336',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(244,67,54,.5)',
            transition: 'transform .1s, box-shadow .1s',
          }}
            onMouseDown={e => { e.currentTarget.style.transform = 'scale(.92)'; }}
            onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {/* Phone down icon */}
            <svg width="30" height="30" viewBox="0 0 24 24" fill="white"
              style={{ transform: 'rotate(135deg)' }}>
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes callRing {
          0%   { box-shadow: 0 0 0 0 ${color}66; }
          70%  { box-shadow: 0 0 0 24px ${color}00; }
          100% { box-shadow: 0 0 0 0 ${color}00; }
        }
        @keyframes callPulse {
          0%,100% { opacity: 1; }
          50%      { opacity: .4; }
        }
        @keyframes soundWave {
          0%,100% { transform: scaleY(.4); opacity: .4; }
          50%     { transform: scaleY(1);  opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Tugma ─────────────────────────────────────────────────
function CallBtn({
  icon, label, active, onClick,
}: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      background: 'none', border: 'none', cursor: 'pointer', color: '#fff',
    }}>
      <div style={{
        width: 58, height: 58, borderRadius: '50%',
        background: active ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24,
        transition: 'background .2s, transform .1s',
      }}
        onMouseDown={e => { e.currentTarget.style.transform = 'scale(.9)'; }}
        onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {icon}
      </div>
      <span style={{ fontSize: 11, opacity: .7 }}>{label}</span>
    </button>
  );
}
