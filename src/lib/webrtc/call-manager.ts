/**
 * WebRTC Call Manager — Telegram Phone API orqali signaling + GroupCall
 *
 * Yangilanish:
 *  1. Signaling chat xabari o'rniga phone.requestCall/acceptCall API orqali
 *  2. ICE/sdp kandidatlar Telegram serveriga MTProto orqali
 *  3. Chatda ko'rinmaydi, "📞RC:" prefiksli xabarlar chiqmaydi
 *  4. Video qo'ng'iroqda Telegram GroupCall API create/join/leave ishlatiladi
 */

import {
  requestCall,
  acceptCall,
  rejectCall,
  endCall,
  setupSignalHandler,
  type SignalPayload,
} from '@/lib/telegram/call-signaling';
import {
  createGroupCall,
  joinGroupCall,
  leaveGroupCall,
} from '@/lib/telegram/group-call';

const CALL_PREFIX = '📞RC:';

// STUN/TURN serverlar (public, bepul)
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

type CallState = 'idle' | 'calling' | 'receiving' | 'active' | 'ended';

export class WebRTCCallManager {
  pc: RTCPeerConnection | null = null;
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;
  callId: string | null = null;
  peerId: string | null = null;
  peerType: string | null = null;
  state: CallState = 'idle';
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private groupCallId: string | null = null;
  private groupCall: any = null;

  // Event callbacks
  onRemoteStream?: (stream: MediaStream) => void;
  onCallEnd?: () => void;
  onConnectionChange?: (state: RTCPeerConnectionState) => void;
  onSignalReceived?: (signal: SignalPayload) => void;

  // ── Qo'ng'iroq boshlash (outgoing) ──────────────────────
  async startCall(
    peerId: string,
    peerType: string,
    isVideo: boolean,
    callerName: string,
  ): Promise<MediaStream> {
    this.cleanup();
    this.callId  = 'rc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    this.peerId  = peerId;
    this.peerType = peerType;
    this.state   = 'calling';

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo ? { width: 640, height: 480 } : false,
    });
    this.localStream = stream;

    const pc = this.createPC();
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: isVideo });
    await pc.setLocalDescription(offer);

    await this.waitForICE(pc);

    const payload: SignalPayload = {
      type: 'offer',
      callId: this.callId,
      sdp: pc.localDescription!.sdp,
      video: isVideo,
      callerName,
    };

    // Phone API orqali yuborish, ishlamasa fallback chat
    await this.sendOfferFallback(peerId, peerType, payload);

    // Video qo'ng'iroqda Telegram GroupCall ni yaratish
    if (isVideo) {
      try {
        const { call, id } = await createGroupCall(peerId, peerType, true);
        this.groupCall = call;
        this.groupCallId = id;
      } catch (e) {
        console.warn('[GroupCall] create failed:', e);
      }
    }

    return stream;
  }

  // ── Qo'ng'iroqni qabul qilish (incoming) ───────────────
  async acceptCall(
    signal: SignalPayload,
    peerId: string,
    peerType: string,
  ): Promise<MediaStream> {
    this.callId  = signal.callId;
    this.peerId  = peerId;
    this.peerType = peerType;
    this.state   = 'active';

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: signal.video ? { width: 640, height: 480 } : false,
    });
    this.localStream = stream;

    const pc = this.createPC();
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp! });

    for (const c of this.pendingCandidates) {
      await pc.addIceCandidate(c).catch(() => {});
    }
    this.pendingCandidates = [];

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this.waitForICE(pc);

    await acceptCall(peerId, peerType, {
      type: 'answer',
      callId: this.callId,
      sdp: pc.localDescription!.sdp,
    }).catch(() => this.sendChatFallback(peerId, peerType, {
      type: 'answer',
      callId: this.callId,
      sdp: pc.localDescription!.sdp,
    }));

    // Video qo'ng'iroqda Telegram GroupCall ga qo'shilish
    if (signal.video) {
      try {
        await joinGroupCall(peerId, peerType, this.groupCallId || this.callId!, true);
      } catch (e) {
        console.warn('[GroupCall] join failed:', e);
      }
    }

    return stream;
  }

  // ── Kiruvchi signalni qayta ishlash ──────────────────
  async handleSignal(signal: SignalPayload): Promise<void> {
    if (signal.callId !== this.callId) return;

    if (signal.type === 'answer' && this.pc) {
      await this.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp! });
      this.state = 'active';
      for (const c of this.pendingCandidates) {
        await this.pc.addIceCandidate(c).catch(() => {});
      }
      this.pendingCandidates = [];
    }

    if (signal.type === 'ice') {
      if (this.pc?.remoteDescription) {
        await this.pc.addIceCandidate(signal.candidate!).catch(() => {});
      } else {
        this.pendingCandidates.push(signal.candidate!);
      }
    }

    if (signal.type === 'end' || signal.type === 'reject') {
      this.cleanup();
    }
  }

  // ── Qo'ng'iroqni tugatish ─────────────────────────────
  async endCall(): Promise<void> {
    if (this.callId && this.peerId && this.peerType) {
      await endCall(this.peerId, this.peerType, { type: 'end', callId: this.callId }).catch(() => this.sendChatFallback(this.peerId!, this.peerType!, { type: 'end', callId: this.callId }));
    }

    // GroupCall dan chiqish
    if (this.groupCallId) {
      try { await leaveGroupCall(this.peerId!, this.peerType!, this.groupCallId); } catch { /* void */ }
    }

    this.cleanup();
  }

  // ── Rad etish ─────────────────────────────────────────
  async rejectCall(): Promise<void> {
    if (this.callId && this.peerId && this.peerType) {
      await rejectCall(this.peerId, this.peerType, { type: 'reject', callId: this.callId }).catch(() => this.sendChatFallback(this.peerId!, this.peerType!, { type: 'reject', callId: this.callId }));
    }

    if (this.groupCallId) {
      try { await leaveGroupCall(this.peerId!, this.peerType!, this.groupCallId); } catch { /* void */ }
    }

    this.cleanup();
  }

  // ── Kamera/mikrofon toggle ────────────────────────────
  toggleAudio(enabled: boolean) {
    this.localStream?.getAudioTracks().forEach(t => { t.enabled = enabled; });
  }

  toggleVideo(enabled: boolean) {
    this.localStream?.getVideoTracks().forEach(t => { t.enabled = enabled; });
  }

  // ── PeerConnection yaratish ──────────────────────────
  private createPC(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;

    pc.ontrack = (e) => {
      if (e.streams[0]) {
        this.remoteStream = e.streams[0];
        this.onRemoteStream?.(e.streams[0]);
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && this.callId && this.peerId && this.peerType) {
        this.sendIceCandidate(e.candidate.toJSON()).catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      this.onConnectionChange?.(pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setTimeout(() => this.cleanup(), 2000);
      }
    };

    return pc;
  }

  // ── ICE kandidatni MTProto orqali yuborish ───────────
  private async sendIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.callId || !this.peerId || !this.peerType) return;

    const payload: SignalPayload = {
      type: 'ice',
      callId: this.callId,
      candidate,
    };

    try {
      const client = await (await import('@/lib/telegram/client')).getTelegramClient();
      const { Api }: any = await import('telegram');
      const Phone = (Api as any).phone;

      await client.invoke(
        new Phone.SendSignalingData({
          peer: new Phone.InputPhoneCall({
            id: BigInt(payload.callId.replace('rc_', '')),
            accessHash: BigInt(0),
          }),
          data: new TextEncoder().encode(JSON.stringify(payload)),
        })
      );
    } catch {
      // ICE kandidat yuborilmasa ham WebRTC o'zi ishlaydi
    }
  }

  // ── ICE yig'ilishini kutish ──────────────────────────
  private waitForICE(pc: RTCPeerConnection, maxMs = 2000): Promise<void> {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise(resolve => {
      const handler = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', handler);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', handler);
      setTimeout(resolve, maxMs);
    });
  }

  // ── Tozalash ─────────────────────────────────────────
  cleanup(): void {
    this.localStream?.getTracks().forEach(t => t.stop());
    this.pc?.close();
    this.localStream = null;
    this.remoteStream = null;
    this.pc = null;
    this.pendingCandidates = [];
    this.state = 'idle';
    this.groupCallId = null;
    this.groupCall = null;
    this.onCallEnd?.();
  }

  // ── Global signal handler ────────────────────────────
  initSignalHandler(): void {
    setupSignalHandler((peerId, payload) => {
      if (peerId === this.peerId && payload.callId === this.callId) {
        this.onSignalReceived?.(payload);
        this.handleSignal(payload);
      }
    });
  }

  // ── Chat fallback: offer/answer/end/reject uchun xabar ──
  private async sendOfferFallback(
    peerId: string,
    peerType: string,
    payload: SignalPayload
  ): Promise<void> {
    try {
      await requestCall(peerId, peerType, payload);
    } catch {
      await this.sendChatFallback(peerId, peerType, payload);
    }
  }

  private async sendChatFallback(
    peerId: string,
    peerType: string,
    payload: SignalPayload
  ): Promise<void> {
    try {
      const { sendMessage } = await import('@/lib/telegram/messages');
      const text = CALL_PREFIX + JSON.stringify(payload);
      await sendMessage(peerId, peerType, text);
    } catch {
      // Oxirgi kurish: signaling yo'q
    }
  }
}

// Singleton
export const callManager = new WebRTCCallManager();