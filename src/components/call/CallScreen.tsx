'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { callManager, CallSignal } from '@/lib/webrtc/call-manager';
import { getCachedPeer } from '@/lib/telegram/peer-cache';

// ── Ranglar ───────────────────────────────────────────────
const COLORS = ['#2AABEE','#E91E63','#9C27B0','#4CAF50','#FF9800','#00BCD4','#F44336','#3F51B5'];
function getColor(id: string) {
  let h = 0; for (let i=0;i<id.length;i++) h=((h<<5)-h)+id.charCodeAt(i);
  return COLORS[Math.abs(h)%COLORS.length];
}
function ini(name: string) {
  return name.split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'?';
}

// ─────────────────────────────────────────────────────────
export default function CallScreen() {
  const { activeCall, setActiveCall, incomingCall, setIncomingCall } = useAppStore();

  if (incomingCall) return <IncomingCallUI />;
  if (activeCall) return <ActiveCallUI />;
  return null;
}

// ── Kiruvchi qo'ng'iroq ────────────────────────────────
function IncomingCallUI() {
  const { incomingCall, setIncomingCall, setActiveCall } = useAppStore();
  const [accepting, setAccepting] = useState(false);

  if (!incomingCall) return null;
  const color = getColor(incomingCall.peerId);

  async function accept() {
    setAccepting(true);
    try {
      const signal = incomingCall!.signal as CallSignal;
      callManager.peerId = incomingCall!.peerId;
      callManager.peerType = 'user';
      callManager.onCallEnd = () => { setActiveCall(null); };

      await callManager.acceptCall(signal, incomingCall!.peerId, 'user');

      setIncomingCall(null);
      setActiveCall({
        peerId: incomingCall!.peerId,
        peerName: incomingCall!.peerName,
        type: incomingCall!.isVideo ? 'video' : 'voice',
        status: 'active',
      });
    } catch (e) {
      console.error('[IncomingCall] accept error:', e);
      setAccepting(false);
    }
  }

  async function reject() {
    callManager.callId = incomingCall!.callId;
    callManager.peerId = incomingCall!.peerId;
    callManager.peerType = 'user';
    await callManager.rejectCall();
    setIncomingCall(null);
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1001,
      background:'rgba(0,0,0,.85)', backdropFilter:'blur(20px)',
      display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
    }}>
      {/* Avatar */}
      <div style={{
        width:100, height:100, borderRadius:'50%',
        background:color, display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:36, fontWeight:700, color:'#fff',
        marginBottom:20,
        boxShadow:`0 0 0 0 ${color}`,
        animation:'incomingRing 1.5s ease-in-out infinite',
      }}>
        {ini(incomingCall.peerName)}
      </div>

      <p style={{color:'rgba(255,255,255,.6)',fontSize:13,letterSpacing:1,marginBottom:8}}>
        {incomingCall.isVideo ? '📹 VIDEO QO\'NG\'IROQ' : '📞 OVOZLI QO\'NG\'IROQ'}
      </p>
      <h2 style={{color:'#fff',fontSize:24,fontWeight:700,marginBottom:8}}>
        {incomingCall.peerName}
      </h2>
      <p style={{color:'rgba(255,255,255,.5)',fontSize:14,marginBottom:48}}>Qo&apos;ng&apos;iroq qilyapti...</p>

      <div style={{display:'flex',gap:40}}>
        {/* Rad etish */}
        <div style={{textAlign:'center'}}>
          <button onClick={reject} style={{
            width:68,height:68,borderRadius:'50%',
            background:'#F44336',border:'none',cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',
            boxShadow:'0 4px 20px rgba(244,67,54,.5)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white" style={{transform:'rotate(135deg)'}}>
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
          </button>
          <p style={{color:'rgba(255,255,255,.6)',fontSize:12,marginTop:8}}>Rad etish</p>
        </div>

        {/* Qabul qilish */}
        <div style={{textAlign:'center'}}>
          <button onClick={accept} disabled={accepting} style={{
            width:68,height:68,borderRadius:'50%',
            background:'#4CAF50',border:'none',cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',
            boxShadow:'0 4px 20px rgba(76,175,80,.5)',
            opacity:accepting?0.7:1,
          }}>
            {accepting ? (
              <div className="spinner" style={{width:24,height:24,borderColor:'rgba(255,255,255,.3)',borderTopColor:'white',borderWidth:3}}/>
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
              </svg>
            )}
          </button>
          <p style={{color:'rgba(255,255,255,.6)',fontSize:12,marginTop:8}}>Qabul qilish</p>
        </div>
      </div>

      <style jsx global>{`
        @keyframes incomingRing {
          0%,100% { box-shadow: 0 0 0 0 ${color}66; }
          70%     { box-shadow: 0 0 0 28px ${color}00; }
        }
      `}</style>
    </div>
  );
}

// ── Faol qo'ng'iroq ────────────────────────────────────
function ActiveCallUI() {
  const { activeCall, setActiveCall } = useAppStore();
  const [duration, setDuration]   = useState(0);
  const [connState, setConn]      = useState<string>('connecting');
  const [muted, setMuted]         = useState(false);
  const [camOff, setCamOff]       = useState(false);
  const [speakerOn, setSpeaker]   = useState(true);

  const localRef  = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const timerRef  = useRef<NodeJS.Timeout|null>(null);

  const isVideo = activeCall?.type === 'video';

  useEffect(() => {
    if (!activeCall) return;

    // Lokal stream
    const localStream = callManager.localStream;
    if (localStream && localRef.current) {
      localRef.current.srcObject = localStream;
    }

    // Remote stream (agar allaqachon kelgan bo'lsa)
    if (callManager.remoteStream && remoteRef.current) {
      remoteRef.current.srcObject = callManager.remoteStream;
    }

    // Callbacks
    callManager.onRemoteStream = (stream) => {
      if (remoteRef.current) remoteRef.current.srcObject = stream;
      setConn('connected');
      startTimer();
    };

    callManager.onConnectionChange = (state) => {
      setConn(state);
      if (state === 'connected') startTimer();
    };

    callManager.onCallEnd = () => {
      stopTimer();
      setActiveCall(null);
    };

    // Agar outgoing call bo'lsa va hali call boslanmagan
    if (activeCall.status === 'calling' && callManager.state === 'idle') {
      startOutgoingCall();
    } else if (activeCall.status === 'active' || callManager.state === 'active') {
      setConn('connected');
      startTimer();
    }

    return () => { stopTimer(); };
  }, []); // eslint-disable-line

  async function startOutgoingCall() {
    try {
      const stream = await callManager.startCall(
        activeCall!.peerId,
        'user',
        isVideo,
        activeCall!.peerName,
      );
      if (localRef.current) localRef.current.srcObject = stream;
      setConn('waiting');
    } catch (e: any) {
      console.error('[Call] startCall error:', e?.message);
      setActiveCall(null);
    }
  }

  function startTimer() {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => setDuration(d => d+1), 1000);
  }
  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  async function endCall() {
    stopTimer();
    await callManager.endCall();
    setActiveCall(null);
  }

  function toggleMute() {
    setMuted(m => { callManager.toggleAudio(m); return !m; });
  }
  function toggleCam() {
    setCamOff(c => { callManager.toggleVideo(c); return !c; });
  }

  function fmtDur(s: number) {
    return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
  }

  if (!activeCall) return null;
  const color = getColor(activeCall.peerId);

  const peer = getCachedPeer(activeCall.peerId);
  const isPeerOnline = peer?.isOnline;

  const statusLabel =
    connState === 'connecting' || connState === 'waiting'
      ? (isPeerOnline ? 'Ulanilmoqda...' : 'Qo\'ng\'iroq qilinmoqda (Oflayn)...')
      : connState === 'connected' ? fmtDur(duration)
      : connState === 'disconnected' ? 'Uzildi'
      : connState === 'failed' ? 'Ulanmadi' : 'Kutilmoqda...';

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1000,
      background: isVideo ? '#000' : '#17212B',
      display:'flex', flexDirection:'column',
    }}>
      {/* Offline banner */}
      {!isPeerOnline && (connState === 'connecting' || connState === 'waiting') && (
        <div style={{
          position: 'absolute',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(255, 152, 0, 0.15)',
          border: '1px solid rgba(255, 158, 0, 0.3)',
          color: '#FFB74D',
          padding: '8px 16px',
          borderRadius: 20,
          fontSize: 13,
          zIndex: 10,
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 10px rgba(0,0,0,.3)',
        }}>
          ⚠️ Yaqiningiz oflayn. U ilovani ochishi kerak.
        </div>
      )}
      {/* Background */}
      {!isVideo && (
        <div style={{
          position:'absolute', inset:0, pointerEvents:'none',
          background:`radial-gradient(circle at 50% 30%, ${color}1A 0%, transparent 65%)`,
        }}/>
      )}

      {/* Remote video */}
      {isVideo && (
        <video ref={remoteRef} autoPlay playsInline
          style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}}/>
      )}

      {/* Top info */}
      <div style={{position:'relative',zIndex:2,textAlign:'center',padding:'52px 24px 12px'}}>
        <p style={{fontSize:12,letterSpacing:1.5,color:'rgba(255,255,255,.5)',marginBottom:6,textTransform:'uppercase'}}>
          {isVideo ? '📹 Video' : '📞 Ovozli'} qo&apos;ng&apos;iroq
        </p>
        <h1 style={{fontSize:26,fontWeight:700,color:'#fff',marginBottom:6}}>
          {activeCall.peerName}
        </h1>
        <div style={{
          fontSize:15, minHeight:22,
          color: connState==='connected' ? '#4CAF50' : 'rgba(255,255,255,.55)',
        }}>
          {connState==='connected' && (
            <span style={{
              display:'inline-block',width:8,height:8,borderRadius:'50%',
              background:'#4CAF50',marginRight:6,verticalAlign:'middle',
              boxShadow:'0 0 6px #4CAF50',
            }}/>
          )}
          {statusLabel}
        </div>
      </div>

      {/* Center */}
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',position:'relative',zIndex:1}}>
        {!isVideo && (
          <div style={{
            width:120,height:120,borderRadius:'50%',
            background:color, display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:44,fontWeight:700,color:'#fff',
            animation: connState!=='connected' ? 'callRing 2s ease-in-out infinite' : 'none',
            boxShadow: connState==='connected' ? `0 0 24px ${color}55` : 'none',
          }}>
            {ini(activeCall.peerName)}
          </div>
        )}

        {/* Local camera (video call) */}
        {isVideo && !camOff && (
          <div style={{
            position:'absolute',bottom:16,right:16,
            width:110,height:150,borderRadius:14,overflow:'hidden',
            border:'2px solid rgba(255,255,255,.25)',background:'#111',zIndex:3,
          }}>
            <video ref={localRef} autoPlay muted playsInline
              style={{width:'100%',height:'100%',objectFit:'cover'}}/>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{position:'relative',zIndex:2,padding:'0 20px 52px'}}>
        <div style={{display:'flex',justifyContent:'center',gap:18,marginBottom:24,flexWrap:'wrap'}}>
          <Btn icon={muted?'🔇':'🎙️'} label={muted?'Ovozni och':'Ovoz off'} active={muted} onClick={toggleMute}/>
          <Btn icon={speakerOn?'🔊':'🔈'} label="Karnay" active={!speakerOn} onClick={()=>setSpeaker(s=>!s)}/>
          {isVideo && <Btn icon={camOff?'📵':'📹'} label={camOff?'Kamera':'Kamera off'} active={camOff} onClick={toggleCam}/>}
          <Btn icon="💬" label="Xabar" active={false} onClick={()=>{}}/>
        </div>

        {/* End */}
        <div style={{display:'flex',justifyContent:'center'}}>
          <button onClick={endCall} style={{
            width:72,height:72,borderRadius:'50%',
            background:'#F44336',border:'none',cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',
            boxShadow:'0 4px 24px rgba(244,67,54,.55)',
          }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="white" style={{transform:'rotate(135deg)'}}>
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes callRing {
          0%,100% { box-shadow: 0 0 0 0 ${color}66; }
          70%     { box-shadow: 0 0 0 30px ${color}00; }
        }
      `}</style>
    </div>
  );
}

function Btn({icon,label,active,onClick}:{icon:string;label:string;active:boolean;onClick:()=>void}) {
  return (
    <button onClick={onClick} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,background:'none',border:'none',cursor:'pointer',color:'#fff'}}>
      <div style={{width:58,height:58,borderRadius:'50%',background:active?'rgba(255,255,255,.3)':'rgba(255,255,255,.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24}}>
        {icon}
      </div>
      <span style={{fontSize:11,opacity:.7}}>{label}</span>
    </button>
  );
}
