/**
 * WebRTC Call Manager — Telegram xabarlari orqali signaling
 * 
 * Ishlash tartibi:
 *   1. Qo'ng'iroqchi → Telegram xabar: "📞RC:{offer, sdp}"
 *   2. Qabul qiluvchi → Ross Messenger detektlaydi → Incoming call UI
 *   3. Qabul → "📞RC:{answer, sdp}" javob
 *   4. ICE kandidatlar almashish
 *   5. WebRTC ulanish o'rnatiladi → real ovoz/video
 */

export const CALL_PREFIX = '📞RC:';

export interface CallSignal {
  type: 'offer' | 'answer' | 'ice' | 'end' | 'reject';
  callId: string;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  video?: boolean;
  callerName?: string;
}

// STUN/TURN servers (public, bepul)
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // Bepul TURN (NAT orqasidagilar uchun)
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

class WebRTCCallManager {
  pc: RTCPeerConnection | null = null;
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;
  callId: string | null = null;
  peerId: string | null = null;
  peerType: string | null = null;
  state: CallState = 'idle';
  private pendingCandidates: RTCIceCandidateInit[] = [];

  // Event callbacks
  onRemoteStream?: (stream: MediaStream) => void;
  onCallEnd?: () => void;
  onConnectionChange?: (state: RTCPeerConnectionState) => void;

  // ── Qo'ng'iroq boshlash ───────────────────────────────
  async startCall(
    peerId: string,
    peerType: string,
    isVideo: boolean,
    callerName: string,
  ): Promise<MediaStream> {
    this.cleanup();
    this.callId  = `rc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.peerId  = peerId;
    this.peerType = peerType;
    this.state   = 'calling';

    // Lokal media olish
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo ? { width: 640, height: 480 } : false,
    });
    this.localStream = stream;

    // PeerConnection yaratish
    const pc = this.createPC();
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    // SDP offer yaratish
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: isVideo });
    await pc.setLocalDescription(offer);

    // ICE yig'ilishini kutish (max 2s)
    await this.waitForICE(pc);

    // Signal yuborish
    await this.sendSignal({
      type: 'offer',
      callId: this.callId,
      sdp: pc.localDescription!.sdp,
      video: isVideo,
      callerName,
    });

    return stream;
  }

  // ── Qo'ng'iroqni qabul qilish ─────────────────────────
  async acceptCall(
    signal: CallSignal,
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

    // Remote offer o'rnatish
    await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp! });

    // Pending candidates qo'shish
    for (const c of this.pendingCandidates) {
      await pc.addIceCandidate(c).catch(() => {});
    }
    this.pendingCandidates = [];

    // Answer yaratish
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this.waitForICE(pc);

    await this.sendSignal({
      type: 'answer',
      callId: this.callId,
      sdp: pc.localDescription!.sdp,
    });

    return stream;
  }

  // ── Signalni qayta ishlash (kelgan xabar) ────────────
  async handleSignal(signal: CallSignal): Promise<void> {
    if (signal.callId !== this.callId) return;

    if (signal.type === 'answer' && this.pc) {
      await this.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp! });
      this.state = 'active';
      // Pending candidates qo'shish
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
      await this.sendSignal({ type: 'end', callId: this.callId }).catch(() => {});
    }
    this.cleanup();
  }

  // ── Rad etish ─────────────────────────────────────────
  async rejectCall(): Promise<void> {
    if (this.callId && this.peerId && this.peerType) {
      await this.sendSignal({ type: 'reject', callId: this.callId }).catch(() => {});
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

  // ── Signal xabar yuborish ─────────────────────────────
  private async sendSignal(signal: CallSignal): Promise<void> {
    if (!this.peerId || !this.peerType) return;
    const { sendMessage } = await import('../telegram/messages');
    const text = CALL_PREFIX + JSON.stringify(signal);
    await sendMessage(this.peerId, this.peerType, text);
  }

  // ── PeerConnection yaratish ───────────────────────────
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
        this.sendSignal({
          type: 'ice',
          callId: this.callId,
          candidate: e.candidate.toJSON(),
        }).catch(() => {});
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

  // ── ICE yig'ilishini kutish ───────────────────────────
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

  // ── Signal xabarini parse qilish ─────────────────────
  static parseSignal(text: string): CallSignal | null {
    if (!text.startsWith(CALL_PREFIX)) return null;
    try {
      return JSON.parse(text.slice(CALL_PREFIX.length));
    } catch {
      return null;
    }
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
    this.onCallEnd?.();
  }
}

export const callManager = new WebRTCCallManager();
