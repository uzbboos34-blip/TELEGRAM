'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { phoneCallManager } from '@/lib/webrtc/call-manager';
import type { IncomingCallInfo } from '@/lib/telegram/call-listener';
import { getCachedPeer } from '@/lib/telegram/peer-cache';

// ── Rang yordamchilari ────────────────────────────────────
const COLORS = ['#2AABEE','#E91E63','#9C27B0','#4CAF50','#FF9800','#00BCD4','#F44336','#3F51B5'];
function getColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i);
  return COLORS[Math.abs(h) % COLORS.length];
}
function ini(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

// ── Asosiy komponent ──────────────────────────────────────
export default function CallScreen() {
  const { activeCall, incomingCall } = useAppStore();

  // phoneCallManager ni init qilish (bir marta)
  useEffect(() => {
    phoneCallManager.init();
    return () => { /* destroy faqat app yopilganda */ };
  }, []);

  if (incomingCall) return <IncomingCallUI />;
  if (activeCall) return <ActiveCallUI />;
  return null;
}

// ── Kiruvchi qo'ng'iroq UI ────────────────────────────────
function IncomingCallUI() {
  const { incomingCall, setIncomingCall, setActiveCall } = useAppStore();
  const [accepting, setAccepting] = useState(false);

  if (!incomingCall) return null;
  const color = getColor(incomingCall.peerId);

  // Qabul qilish
  async function accept() {
    if (!incomingCall) return;
    setAccepting(true);
    try {
      // phoneCallManager.acceptCall — DH kalit almashinuvi va audio boshlaydi
      await phoneCallManager.acceptCall(
        incomingCall.callId,
        incomingCall.accessHash,
        incomingCall.gAHash, // bu yerda gAHash beriladi; haqiqiy gA PhoneCallAccepted'da keladi
      );

      phoneCallManager.onCallActive = (stream) => {
        setIncomingCall(null);
        setActiveCall({
          peerId: incomingCall.peerId,
          peerName: incomingCall.peerName,
          type: incomingCall.isVideo ? 'video' : 'voice',
          status: 'active',
        });
      };

      phoneCallManager.onCallEnded = (reason) => {
        setActiveCall(null);
        setIncomingCall(null);
      };

    } catch (e) {
      console.error('[CallScreen] accept error:', e);
      setAccepting(false);
    }
  }

  // Rad etish
  async function reject() {
    await phoneCallManager.rejectCall(incomingCall!.callId, incomingCall!.accessHash);
    setIncomingCall(null);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1001,
      background: 'rgba(0,0,0,.88)', backdropFilter: 'blur(24px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Pulsing Avatar */}
      <div style={{
        width: 104, height: 104, borderRadius: '50%',
        background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 38, fontWeight: 700, color: '#fff',
        marginBottom: 24,
        animation: 'incomingRing 1.5s ease-in-out infinite',
      }}>
        {ini(incomingCall.peerName)}
      </div>

      <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>
        {incomingCall.isVideo ? '📹 Video qo\'ng\'iroq' : '📞 Ovozli qo\'ng\'iroq'}
      </p>
      <h2 style={{ color: '#fff', fontSize: 26, fontWeight: 700, marginBottom: 6 }}>
        {incomingCall.peerName}
      </h2>
      <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 14, marginBottom: 52 }}>
        Qo&apos;ng&apos;iroq qilyapti...
      </p>

      <div style={{ display: 'flex', gap: 48 }}>
        {/* Rad etish */}
        <CallButton
          icon={<PhoneEndIcon />}
          label="Rad etish"
          color="#F44336"
          onClick={reject}
        />
        {/* Qabul qilish */}
        <CallButton
          icon={accepting ? <Spinner /> : <PhoneIcon />}
          label="Qabul"
          color="#4CAF50"
          onClick={accept}
          disabled={accepting}
        />
      </div>

      <style>{`
        @keyframes incomingRing {
          0%, 100% { box-shadow: 0 0 0 0 ${color}55; }
          70%       { box-shadow: 0 0 0 32px ${color}00; }
        }
      `}</style>
    </div>
  );
}

// ── Faol qo'ng'iroq UI ────────────────────────────────────
function ActiveCallUI() {
  const { activeCall, setActiveCall } = useAppStore();
  const [duration, setDuration] = useState(0);
  const [connState, setConn] = useState<'connecting' | 'active' | 'failed'>('connecting');
  const [muted, setMuted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!activeCall) return;

    // Manager callbacklari
    phoneCallManager.onCallActive = () => {
      setConn('active');
      startTimer();
    };

    phoneCallManager.onCallEnded = () => {
      stopTimer();
      setActiveCall(null);
    };

    phoneCallManager.onError = (err) => {
      console.error('[ActiveCallUI] Error:', err);
      setConn('failed');
    };

    // Agar caller bo'lsa va idle bo'lsa — qo'ng'iroq boshlash
    if (activeCall.status === 'calling' && phoneCallManager.state === 'idle') {
      phoneCallManager.startCall(activeCall.peerId).catch(err => {
        console.error('[ActiveCallUI] startCall error:', err);
        setActiveCall(null);
      });
    } else if (activeCall.status === 'active') {
      setConn('active');
      startTimer();
    }

    return () => stopTimer();
  }, []); // eslint-disable-line

  function startTimer() {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  }
  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function endCall() {
    stopTimer();
    await phoneCallManager.endCall();
    setActiveCall(null);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    phoneCallManager.setMuted(next);
  }

  function fmtDur(s: number) {
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  }

  if (!activeCall) return null;
  const color = getColor(activeCall.peerId);
  const peer = getCachedPeer(activeCall.peerId);

  const statusLabel =
    connState === 'active' ? fmtDur(duration)
    : connState === 'failed' ? 'Ulanmadi'
    : peer?.isOnline ? 'Ulanilmoqda...' : 'Qo\'ng\'iroq qilinmoqda...';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: '#17212B',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Gradient bg */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(circle at 50% 28%, ${color}22 0%, transparent 60%)`,
      }} />

      {/* Offline xabarnoması */}
      {!peer?.isOnline && connState === 'connecting' && (
        <div style={{
          position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255,152,0,.12)', border: '1px solid rgba(255,152,0,.3)',
          color: '#FFB74D', padding: '8px 16px', borderRadius: 20, fontSize: 13, zIndex: 10,
          whiteSpace: 'nowrap',
        }}>
          ⚠️ Yaqiningiz oflayn. U ilovani ochishi kerak.
        </div>
      )}

      {/* Top */}
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: '52px 24px 0' }}>
        <p style={{ fontSize: 11, letterSpacing: 2, color: 'rgba(255,255,255,.4)', marginBottom: 8, textTransform: 'uppercase' }}>
          📞 Ovozli qo&apos;ng&apos;iroq
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
          {activeCall.peerName}
        </h1>
        <div style={{
          fontSize: 15, minHeight: 22,
          color: connState === 'active' ? '#4CAF50' : 'rgba(255,255,255,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          {connState === 'active' && (
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#4CAF50', boxShadow: '0 0 6px #4CAF50',
              display: 'inline-block',
            }} />
          )}
          {statusLabel}
        </div>
      </div>

      {/* Avatar */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{
          width: 128, height: 128, borderRadius: '50%',
          background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 48, fontWeight: 700, color: '#fff',
          animation: connState !== 'active' ? 'callRing 2s ease-in-out infinite' : 'none',
          boxShadow: connState === 'active' ? `0 0 28px ${color}44` : 'none',
          transition: 'box-shadow 0.5s',
        }}>
          {ini(activeCall.peerName)}
        </div>
      </div>

      {/* Controls */}
      <div style={{ position: 'relative', zIndex: 2, padding: '0 20px 52px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 28 }}>
          <CtrlBtn
            icon={muted ? '🔇' : '🎙️'}
            label={muted ? 'Ovoz yoq' : 'Mikrofon'}
            active={muted}
            onClick={toggleMute}
          />
          <CtrlBtn icon="🔊" label="Karnay" active={false} onClick={() => {}} />
          <CtrlBtn icon="💬" label="Xabar" active={false} onClick={() => {}} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <CallButton
            icon={<PhoneEndIcon />}
            label=""
            color="#F44336"
            size={72}
            onClick={endCall}
          />
        </div>
      </div>

      <style>{`
        @keyframes callRing {
          0%, 100% { box-shadow: 0 0 0 0 ${color}55; }
          70%       { box-shadow: 0 0 0 36px ${color}00; }
        }
      `}</style>
    </div>
  );
}

// ── Kichik UI komponentlari ───────────────────────────────
function CallButton({
  icon, label, color, size = 68, onClick, disabled,
}: {
  icon: React.ReactNode; label: string; color: string;
  size?: number; onClick: () => void; disabled?: boolean;
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          width: size, height: size, borderRadius: '50%',
          background: color, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 4px 20px ${color}55`,
          opacity: disabled ? 0.7 : 1,
          transition: 'transform 0.1s, opacity 0.2s',
        }}
      >
        {icon}
      </button>
      {label && <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, marginTop: 8 }}>{label}</p>}
    </div>
  );
}

function CtrlBtn({ icon, label, active, onClick }: {
  icon: string; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      background: 'none', border: 'none', cursor: 'pointer', color: '#fff',
    }}>
      <div style={{
        width: 58, height: 58, borderRadius: '50%',
        background: active ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
        transition: 'background 0.2s',
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 11, opacity: 0.6 }}>{label}</span>
    </button>
  );
}

function PhoneIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
    </svg>
  );
}

function PhoneEndIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="white" style={{ transform: 'rotate(135deg)' }}>
      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
    </svg>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 24, height: 24, borderRadius: '50%',
      border: '3px solid rgba(255,255,255,.3)',
      borderTopColor: 'white', animation: 'spin 0.8s linear infinite',
    }} />
  );
}