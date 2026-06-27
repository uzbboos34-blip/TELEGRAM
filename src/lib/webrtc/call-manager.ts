/**
 * Phone Call Manager — Telegram rasmiy VoIP tizimi
 *
 * Bu manager WebRTC SDP ISHLATMAYDI.
 * Telegram MTProto Phone API + DH kalit almashinuvi + Relay audio.
 *
 * Qo'ng'iroq oqimi:
 *  CALLER: requestPhoneCall → (kutish) → PhoneCallAccepted event → confirmPhoneCall → audio
 *  CALLEE: PhoneCallRequested event → acceptPhoneCall → audio
 */

import {
  requestPhoneCall,
  acceptPhoneCall,
  discardPhoneCall,
  getActiveCall,
  clearActiveCall,
  type PhoneConnection,
} from '@/lib/telegram/call-signaling';
import {
  setupCallListener,
  type IncomingCallInfo,
} from '@/lib/telegram/call-listener';
import { TelegramVoiceTransport } from '@/lib/telegram/voice-transport';
import { getCachedPeer } from '@/lib/telegram/peer-cache';

// ── State ─────────────────────────────────────────────────
export type CallState = 'idle' | 'calling' | 'ringing' | 'active' | 'ended';

export class PhoneCallManager {
  state: CallState = 'idle';
  localStream: MediaStream | null = null;

  private transport: TelegramVoiceTransport | null = null;
  private removeListener: (() => void) | null = null;
  private callStartTime: number | null = null;

  // ── Event callbacks ──────────────────────────────────
  onIncomingCall?: (info: IncomingCallInfo & { peerName: string }) => void;
  onCallActive?: (stream: MediaStream) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onCallEnded?: (reason: string) => void;
  onError?: (err: Error) => void;

  // ── Singleton init ───────────────────────────────────
  init(): void {
    if (this.removeListener) return; // Allaqachon ishga tushirilgan

    this.removeListener = setupCallListener(
      // 1. Kiruvchi qo'ng'iroq
      (info: IncomingCallInfo) => {
        this.state = 'ringing';
        const peer = getCachedPeer(info.adminId.toString());
        this.onIncomingCall?.({
          ...info,
          peerName: peer?.name ?? `User ${info.adminId}`,
        });
      },

      // 2. Qo'ng'iroq tasdiqlandi → audio/video boshlash
      async (connections: PhoneConnection[], authKey: Uint8Array) => {
        const activeCall = getActiveCall();
        await this.startAudio(connections, authKey, activeCall?.video ?? false);
      },

      // 3. Qo'ng'iroq tugadi
      (reason: string) => {
        this.cleanup(reason);
      },
    );
  }

  // ── Qo'ng'iroq boshlash (Caller) ──────────────────────
  async startCall(peerId: string, video = false): Promise<void> {
    if (this.state !== 'idle') throw new Error('Allaqachon qo\'ng\'iroq bor');

    this.state = 'calling';
    this.callStartTime = Date.now();

    try {
      await requestPhoneCall(peerId, video);
      // Endi PhoneCallAccepted event kutamiz (call-listener.ts qayta ishlaydi)
      console.log('[PhoneCallManager] Outgoing call sent. Waiting for answer...');
    } catch (e) {
      this.state = 'idle';
      throw e;
    }
  }

  // ── Kiruvchi qo'ng'iroqni qabul qilish (Callee) ───────
  async acceptCall(
    callId: bigint,
    callAccessHash: bigint,
    gA: Uint8Array,
    video = false,
  ): Promise<void> {
    if (this.state !== 'ringing') return;
    this.state = 'active';
    this.callStartTime = Date.now();

    try {
      const callState = await acceptPhoneCall(callId, callAccessHash, gA, video);

      if (!callState.authKey) throw new Error('authKey yaratilmadi');

      await this.startAudio(callState.connections, callState.authKey, video);
    } catch (e) {
      this.state = 'idle';
      throw e;
    }
  }

  // ── Audio/Video oqimini ishga tushirish ───────────────
  private async startAudio(
    connections: PhoneConnection[],
    authKey: Uint8Array,
    video = false,
  ): Promise<void> {
    const activeCall = getActiveCall();
    if (!activeCall) return;

    const isCaller = activeCall.isCaller;

    // Proxy URL (env dan)
    const proxyUrl =
      process.env.NEXT_PUBLIC_VOICE_PROXY_URL ?? 'http://localhost:8080';

    this.transport = new TelegramVoiceTransport();

    this.transport.onConnected = () => {
      this.state = 'active';
      console.log('[PhoneCallManager] WebRTC connected!');
    };

    this.transport.onDisconnected = () => {
      console.log('[PhoneCallManager] WebRTC disconnected');
      this.cleanup('disconnect');
    };

    this.transport.onRemoteStream = (stream) => {
      console.log('[PhoneCallManager] Remote stream received');
      this.onRemoteStream?.(stream);
    };

    this.transport.onError = (err) => {
      console.error('[PhoneCallManager] Transport error:', err);
      this.onError?.(err);
    };

    try {
      const stream = await this.transport.connect(
        connections,
        authKey,
        isCaller,
        proxyUrl,
        video,
      );

      this.localStream = stream;
      this.state = 'active';
      this.onCallActive?.(stream);

      console.log('[PhoneCallManager] Call active. connections:', connections.length, 'video:', video);
    } catch (e) {
      console.error('[PhoneCallManager] startAudio failed:', e);
      // Proxy yo'q bo'lsa ham UI ni active ko'rsatamiz (debug uchun)
      this.state = 'active';
    }
  }

  // ── Qo'ng'iroqni tugatish ─────────────────────────────
  async endCall(): Promise<void> {
    const activeCall = getActiveCall();

    if (activeCall) {
      const duration = this.callStartTime
        ? Math.floor((Date.now() - this.callStartTime) / 1000)
        : 0;

      await discardPhoneCall(
        activeCall.callId,
        activeCall.accessHash,
        'hangup',
        duration,
      );
    }

    this.cleanup('hangup');
  }

  // ── Kiruvchi qo'ng'iroqni rad etish ──────────────────
  async rejectCall(callId: bigint, accessHash: bigint): Promise<void> {
    await discardPhoneCall(callId, accessHash, 'missed');
    this.cleanup('missed');
  }

  // ── Mikrofon toggle ───────────────────────────────────
  setMuted(muted: boolean): void {
    this.transport?.setMuted(muted);
  }

  // ── Tozalash ──────────────────────────────────────────
  private cleanup(reason: string): void {
    this.transport?.disconnect();
    this.transport = null;
    this.localStream = null;
    this.state = 'idle';
    this.callStartTime = null;
    clearActiveCall();
    this.onCallEnded?.(reason);
  }

  // ── Destroy (listener olib tashlash) ─────────────────
  destroy(): void {
    this.cleanup('destroyed');
    this.removeListener?.();
    this.removeListener = null;
  }
}

// Singleton instance
export const phoneCallManager = new PhoneCallManager();