/**
 * Voice Transport — Telegram Relay orqali audio uzatish
 *
 * Browser UDP yubora olmaydi → WebSocket → UDP proxy kerak.
 * Bu modul:
 *  1. Mikrofon audio oladi (Web Audio API)
 *  2. Opus enkodlash (AudioWorklet orqali)
 *  3. Backend proxy'ga WebSocket orqali yuboradi
 *  4. Kelgan audio paketlarni dekodlab o'ynaydi
 *
 * NOTE: Haqiqiy libtgvoip WASM bo'lmasa bu oddiy PCM transport.
 * Rasmiy Telegram ilovasi bilan to'liq mos ishlash uchun
 * keyinchalik @tgcalls/tgcalls paketi yoki native WASM kerak.
 */

import { deriveCallKey } from './call-crypto';
import type { PhoneConnection } from './call-signaling';

export class TelegramVoiceTransport {
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private localStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private encryptKey: CryptoKey | null = null;
  private encryptIv: Uint8Array | null = null;
  private isConnected = false;
  private seqNo = 0;

  // Remote audio
  private remoteGain: GainNode | null = null;

  // Callbacks
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (err: Error) => void;

  // ── Ulanish ──────────────────────────────────────────
  async connect(
    connections: PhoneConnection[],
    authKey: Uint8Array,
    isCaller: boolean,
    proxyUrl: string, // NEXT_PUBLIC_VOICE_PROXY_URL
  ): Promise<MediaStream> {
    // 1. Shifrlash kalitini tayyorlash
    const { key, iv } = await deriveCallKey(authKey, isCaller);
    this.encryptKey = key;
    this.encryptIv = iv;

    // 2. Mikrofon olish
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
      },
      video: false,
    });

    // 3. Audio context
    this.audioCtx = new AudioContext({ sampleRate: 48000 });
    this.remoteGain = this.audioCtx.createGain();
    this.remoteGain.connect(this.audioCtx.destination);

    // 4. Eng yaxshi relay serverga ulanish (birinchisi)
    const relay = connections[0];
    if (!relay) throw new Error('Relay server topilmadi');

    // 5. WebSocket proxy ga ulanish
    await this.connectWebSocket(relay, proxyUrl);

    // 6. Audio processing boshlash
    this.startAudioProcessing();

    return this.localStream;
  }

  // ── WebSocket → UDP proxy ───────────────────────────
  private connectWebSocket(
    relay: PhoneConnection,
    proxyUrl: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // http/https → ws/wss ga o'tkazish (Render.com WSS ishlatadi)
      const wsUrl = proxyUrl
        .replace(/^http:\/\//, 'ws://')
        .replace(/^https:\/\//, 'wss://')
        .replace(/\/$/, '') + '/call';

      console.log('[VoiceTransport] Connecting to proxy:', wsUrl);
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        // Relay ma'lumotlarini yuborish
        this.ws!.send(JSON.stringify({
          type: 'init',
          relay: {
            ip: relay.ip,
            port: relay.port,
          },
          peerTag: Array.from(relay.peerTag),
        }));
        // ready event kelguncha kutamiz
      };

      this.ws.onmessage = (event) => {
        // Proxy'dan 'ready' xabari
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'ready') {
              this.isConnected = true;
              this.onConnected?.();
              resolve();
            }
          } catch { /* ignore */ }
          return;
        }
        // Kelgan audio paket (binary)
        if (event.data instanceof ArrayBuffer) {
          this.handleIncomingAudio(event.data).catch(console.warn);
        }
      };

      this.ws.onerror = () => {
        const err = new Error('Voice proxy WebSocket ulanmadi');
        this.onError?.(err);
        if (!this.isConnected) reject(err);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.onDisconnected?.();
      };

      // 8 soniya timeout
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('Voice proxy timeout (8s)'));
        }
      }, 8000);
    });
  }

  // ── Audio qayta ishlash va yuborish ──────────────────
  private startAudioProcessing(): void {
    if (!this.localStream || !this.audioCtx) return;

    const source = this.audioCtx.createMediaStreamSource(this.localStream);

    // ScriptProcessor — AudioWorklet ga nisbatan keng qo'llab-quvvatlanadi
    // TODO: AudioWorklet ga o'tish (ScriptProcessor deprecated)
    this.scriptProcessor = this.audioCtx.createScriptProcessor(960, 1, 1);

    this.scriptProcessor.onaudioprocess = async (e) => {
      if (!this.isConnected || !this.ws) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = float32ToPCM16(inputData);

      // Paketni shifrlash va yuborish
      const packet = await this.buildPacket(pcm16);
      if (packet && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(packet);
      }
    };

    source.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioCtx.destination);
  }

  // ── Paket qurish (seq + encrypted PCM) ───────────────
  private async buildPacket(pcm16: Int16Array): Promise<ArrayBuffer | null> {
    try {
      if (!this.encryptKey || !this.encryptIv) return null;

      // Header: 4 byte seqNo + 4 byte timestamp
      const header = new ArrayBuffer(8);
      const headerView = new DataView(header);
      headerView.setUint32(0, this.seqNo++, false);
      headerView.setUint32(4, Math.floor(Date.now() / 1000), false);

      // Audio shifrlash — yangi ArrayBuffer da nusxa yaratish (SharedArrayBuffer bug workaround)
      const rawBuf = new ArrayBuffer(pcm16.byteLength);
      new Int16Array(rawBuf).set(pcm16);
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-CTR', counter: new Uint8Array(this.encryptIv!), length: 64 },
        this.encryptKey,
        rawBuf,
      );

      // Header + encrypted audio
      const packet = new Uint8Array(8 + encrypted.byteLength);
      packet.set(new Uint8Array(header), 0);
      packet.set(new Uint8Array(encrypted), 8);

      return packet.buffer;
    } catch {
      return null;
    }
  }

  // ── Kelgan audio qayta ishlash ────────────────────────
  private async handleIncomingAudio(data: ArrayBuffer): Promise<void> {
    if (!this.audioCtx || !this.encryptKey || !this.encryptIv || !this.remoteGain) return;
    if (data.byteLength <= 8) return; // Header only — ignore

    try {
      // Header o'tkazib yuborish (8 byte)
      const audioData = data.slice(8);

      // Dekodlash
      const audioBuf: ArrayBuffer = audioData.slice(0);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-CTR', counter: new Uint8Array(this.encryptIv!), length: 64 },
        this.encryptKey,
        audioBuf,
      );

      // PCM16 → Float32 → AudioBuffer → play
      const pcm16 = new Int16Array(decrypted);
      const float32 = pcm16ToFloat32(pcm16);

      const audioBuffer = this.audioCtx.createBuffer(1, float32.length, 48000);
      audioBuffer.copyToChannel(new Float32Array(float32), 0);

      const source = this.audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.remoteGain!);
      source.start(this.audioCtx.currentTime);
    } catch {
      // Dekodlash xatosi — ignore (ba'zan packet yo'qoladi)
    }
  }

  // ── Mikrofon toggle ───────────────────────────────────
  setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach(t => {
      t.enabled = !muted;
    });
  }

  // ── Ulanishni uzish ───────────────────────────────────
  disconnect(): void {
    this.scriptProcessor?.disconnect();
    this.scriptProcessor = null;
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.audioCtx?.close();
    this.audioCtx = null;
    this.ws?.close();
    this.ws = null;
    this.isConnected = false;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }
}

// ── PCM konversiya yordamchilari ──────────────────────────
function float32ToPCM16(float32: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}

function pcm16ToFloat32(pcm16: Int16Array): Float32Array {
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32;
}
