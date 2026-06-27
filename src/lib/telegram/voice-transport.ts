/**
 * Call Transport — Telegram VoIP uchun WebRTC mantiqi
 *
 * Client ⇄ WebRTC Proxy (WebSocket signaling) ⇄ Telegram UDP Relay
 */

import type { PhoneConnection } from './call-signaling';

export class TelegramVoiceTransport {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private isConnected = false;

  // Callbacks
  onConnected?: () => void;
  onDisconnected?: () => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onError?: (err: Error) => void;

  // ── Ulanish ──────────────────────────────────────────
  async connect(
    connections: PhoneConnection[],
    authKey: Uint8Array,
    isCaller: boolean,
    proxyUrl: string, // NEXT_PUBLIC_VOICE_PROXY_URL
    video = false,
  ): Promise<MediaStream> {
    // 1. Mikrofon va kamerani olish
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: video ? {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 24 },
      } : false,
    });

    // 2. WebRTC Peer Connection
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    // Local tracklarni qo'shish
    this.localStream.getTracks().forEach((track) => {
      this.pc!.addTrack(track, this.localStream!);
    });

    // Masofaviy oqim qabul qilinganda
    this.remoteStream = new MediaStream();
    this.pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach((track) => {
          this.remoteStream!.addTrack(track);
        });
        this.onRemoteStream?.(this.remoteStream!);
      } else {
        this.remoteStream!.addTrack(event.track);
        this.onRemoteStream?.(this.remoteStream!);
      }
    };

    // 3. Birinchi relay serverni olish
    const relay = connections[0];
    if (!relay) throw new Error('Relay server topilmadi');

    // 4. WebSocket proxy ga ulanish va SDP signaling boshlash
    await this.startSignaling(relay, authKey, isCaller, proxyUrl);

    return this.localStream;
  }

  // ── WebSocket orqali SDP almashish ─────────────────
  private startSignaling(
    relay: PhoneConnection,
    authKey: Uint8Array,
    isCaller: boolean,
    proxyUrl: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = proxyUrl
        .replace(/^http:\/\//, 'ws://')
        .replace(/^https:\/\//, 'wss://')
        .replace(/\/$/, '') + '/call';

      console.log('[CallTransport] Connecting to proxy signaling:', wsUrl);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = async () => {
        try {
          // WebRTC Offer yaratish
          const offer = await this.pc!.createOffer();
          await this.pc!.setLocalDescription(offer);

          // AuthKey ni hex ga o'tkazish
          const authKeyHex = Array.from(authKey)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');

          // Offer ni proxy ga yuborish
          this.ws!.send(JSON.stringify({
            type: 'offer',
            sdp: this.pc!.localDescription,
            relay: {
              ip: relay.ip,
              port: relay.port,
            },
            peerTag: Array.from(relay.peerTag),
            authKeyHex,
            isCaller,
          }));
        } catch (e: any) {
          reject(e);
        }
      };

      this.ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'answer') {
            await this.pc!.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            this.isConnected = true;
            this.onConnected?.();
            resolve();
          }
        } catch (e: any) {
          console.error('[CallTransport] Signaling message error:', e);
        }
      };

      this.ws.onerror = () => {
        const err = new Error('Voice/Video proxy ulanishi rad etildi');
        this.onError?.(err);
        if (!this.isConnected) reject(err);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.onDisconnected?.();
      };
    });
  }

  // ── Mikrofon toggle ───────────────────────────────────
  setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }

  // ── Ulanishni uzish ───────────────────────────────────
  disconnect(): void {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.remoteStream = null;
    this.pc?.close();
    this.pc = null;
    this.ws?.close();
    this.ws = null;
    this.isConnected = false;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }
}
