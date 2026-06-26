'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';

// ── Avatarlar uchun ────────────────────────────────────────
const GRADS = ['avatar-gradient-1','avatar-gradient-2','avatar-gradient-3','avatar-gradient-4','avatar-gradient-5'];
function getGrad(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i);
  return GRADS[Math.abs(h) % GRADS.length];
}
function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

// ─────────────────────────────────────────────────────────────
export default function CallScreen() {
  const { activeCall, setActiveCall } = useAppStore();
  const [status, setStatus]       = useState<'calling'|'ringing'|'active'|'ended'>('calling');
  const [duration, setDuration]   = useState(0);
  const [muted, setMuted]         = useState(false);
  const [speakerOn, setSpeaker]   = useState(true);
  const [camOff, setCamOff]       = useState(false);

  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timerRef       = useRef<NodeJS.Timeout | null>(null);

  const isVideo = activeCall?.type === 'video';

  // ── Start call / get media ─────────────────────────────
  useEffect(() => {
    if (!activeCall) return;
    setStatus('calling');
    setDuration(0);

    // Simulatsiya: 2 soniyadan keyin ulanish
    const connectTimer = setTimeout(() => {
      setStatus('active');
      startTimer();
      if (isVideo) startLocalCamera();
    }, 2000);

    return () => {
      clearTimeout(connectTimer);
      stopAll();
    };
  }, [activeCall?.peerId]); // eslint-disable-line

  async function startLocalCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true, audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (e) {
      console.warn('[Call] Kamera ruxsati berilmadi:', e);
    }
  }

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  }

  function stopAll() {
    if (timerRef.current) clearInterval(timerRef.current);
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
  }

  function formatDuration(sec: number) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function endCall() {
    setStatus('ended');
    stopAll();
    setTimeout(() => setActiveCall(null), 500);
  }

  function toggleMute() {
    setMuted(m => {
      const next = !m;
      localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next; });
      return next;
    });
  }

  function toggleCam() {
    setCamOff(c => {
      const next = !c;
      localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !next; });
      return next;
    });
  }

  if (!activeCall) return null;

  const grad = getGrad(activeCall.peerId);
  const ini  = initials(activeCall.peerName);

  const statusText =
    status === 'calling' ? 'Ulanilmoqda...' :
    status === 'ringing' ? 'Jiringlayapti...' :
    status === 'active'  ? formatDuration(duration) :
    'Tugadi';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: isVideo ? '#000' : 'linear-gradient(160deg, #1a2c3d 0%, #0d1b2a 60%, #17212B 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'space-between',
      padding: 'env(safe-area-inset-top, 40px) 0 env(safe-area-inset-bottom, 40px)',
    }}>

      {/* Remote video background */}
      {isVideo && (
        <video ref={remoteVideoRef} autoPlay playsInline
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', opacity: status === 'active' ? 1 : 0,
            transition: 'opacity .5s',
          }}
        />
      )}

      {/* Overlay gradient for video calls */}
      {isVideo && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,.6) 0%, transparent 35%, transparent 65%, rgba(0,0,0,.7) 100%)',
          pointerEvents: 'none',
        }} />
      )}

      {/* ── Top: Name + Status ─────────────────── */}
      <div style={{ textAlign: 'center', paddingTop: 20, position: 'relative', zIndex: 10 }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', letterSpacing: 1, marginBottom: 8 }}>
          {isVideo ? '📹 VIDEO QO\'NG\'IROQ' : '📞 OVOZLI QO\'NG\'IROQ'}
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
          {activeCall.peerName}
        </h1>
        <div style={{
          fontSize: 16, color: status === 'active' ? '#4CAF50' : 'rgba(255,255,255,.65)',
          transition: 'color .4s',
        }}>
          {statusText}
        </div>
      </div>

      {/* ── Center: Avatar (voice) or Local Video ─ */}
      <div style={{ position: 'relative', zIndex: 10 }}>
        {isVideo ? (
          <div style={{ position: 'relative' }}>
            <video ref={localVideoRef} autoPlay muted playsInline
              style={{
                width: 120, height: 160, objectFit: 'cover',
                borderRadius: 16, border: '2px solid rgba(255,255,255,.2)',
                background: '#111',
                display: camOff ? 'none' : 'block',
              }}
            />
            {camOff && (
              <div style={{
                width: 120, height: 160, borderRadius: 16,
                background: 'rgba(255,255,255,.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 40,
              }}>
                🚫
              </div>
            )}
          </div>
        ) : (
          <div className={`dialog-avatar ${grad}`} style={{
            width: 110, height: 110, fontSize: 40,
            boxShadow: '0 0 0 4px rgba(42,171,238,.3), 0 0 0 8px rgba(42,171,238,.1)',
          }}>
            {ini}
          </div>
        )}
      </div>

      {/* ── Bottom: Controls ───────────────────── */}
      <div style={{ position: 'relative', zIndex: 10, width: '100%', padding: '0 20px' }}>
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 24,
          flexWrap: 'wrap',
        }}>
          {/* Mute */}
          <CallBtn
            label={muted ? 'Unmute' : 'Mute'}
            active={muted}
            onClick={toggleMute}
            icon={muted ? '🔇' : '🎙️'}
          />
          {/* Speaker */}
          <CallBtn
            label={speakerOn ? 'Speaker' : 'Earphone'}
            active={!speakerOn}
            onClick={() => setSpeaker(s => !s)}
            icon={speakerOn ? '🔊' : '🔈'}
          />
          {/* Camera (video only) */}
          {isVideo && (
            <CallBtn
              label={camOff ? 'Camera on' : 'Camera off'}
              active={camOff}
              onClick={toggleCam}
              icon={camOff ? '📵' : '📹'}
            />
          )}
          {/* Messages */}
          <CallBtn
            label="Xabar"
            active={false}
            onClick={() => {}}
            icon="💬"
          />
        </div>

        {/* End Call */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button onClick={endCall} style={{
            width: 72, height: 72, borderRadius: '50%',
            background: '#E53935', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 24px rgba(229,57,53,.5)',
            transition: 'transform .1s',
          }}
            onMouseDown={e => (e.currentTarget.style.transform = 'scale(.95)')}
            onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes callPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(42,171,238,.4); }
          50%      { box-shadow: 0 0 0 16px rgba(42,171,238,0); }
        }
      `}</style>
    </div>
  );
}

// ── CallBtn component ──────────────────────────────────────
function CallBtn({ icon, label, active, onClick }: {
  icon: string; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      background: 'none', border: 'none', cursor: 'pointer', color: '#fff',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: active ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24,
        transition: 'background .2s',
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 11, opacity: .75 }}>{label}</span>
    </button>
  );
}
