/**
 * Telegram Voice & Video VoIP WebRTC-to-UDP Proxy Server
 *
 * pure JavaScript (werift) WebRTC engine orqali:
 * Next.js (WebRTC SDP/RTP) ⇄ Proxy (AES-CTR shifrlash) ⇄ Telegram UDP Relay
 *
 * C++ native bindings talab qilmaydi.
 */

const http = require('http');
const WebSocket = require('ws');
const dgram = require('dgram');
const crypto = require('crypto');
const {
  RTCPeerConnection,
  RTCRtpCodecParameters,
  MediaStreamTrack,
} = require('werift');

const PORT = parseInt(process.env.PORT || '8080');

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', connections: wss.clients.size }));
    return;
  }
  res.writeHead(404).end('Not Found');
});

const wss = new WebSocket.Server({ server: httpServer });
console.log(`[VoiceProxy] WebSocket server started on port ${PORT}`);

// VoIP AES-256-CTR key derivation
function deriveVoIPKeys(authKey, isCaller) {
  const sha256 = (data) => crypto.createHash('sha256').update(data).digest();
  
  // Encrypt & Decrypt keys
  const key1 = sha256(Buffer.concat([authKey, Buffer.from([isCaller ? 1 : 0])]));
  const key2 = sha256(Buffer.concat([authKey, Buffer.from([isCaller ? 0 : 1])]));

  return { encryptKey: key1, decryptKey: key2 };
}

wss.on('connection', (ws, req) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`[VoiceProxy] Client connected: ${clientIp}`);

  let pc = null;
  let udpSocket = null;
  let relayInfo = null;
  let encryptKey = null;
  let decryptKey = null;
  let isCaller = false;
  let seqNo = 0;

  ws.on('message', async (rawData) => {
    try {
      const msg = JSON.parse(rawData.toString());

      // ── WebRTC Signaling: Client Offer ───────────────────
      if (msg.type === 'offer') {
        relayInfo = msg.relay; // { ip, port }
        const peerTag = Buffer.from(msg.peerTag || new Array(16).fill(0));
        const authKey = Buffer.from(msg.authKeyHex, 'hex');
        isCaller = msg.isCaller;

        // Kalitlarni generatsiya qilish
        const keys = deriveVoIPKeys(authKey, isCaller);
        encryptKey = keys.encryptKey;
        decryptKey = keys.decryptKey;

        console.log(`[VoiceProxy] Setting up WebRTC PC to Relay: ${relayInfo.ip}:${relayInfo.port}`);

        // UDP socket yaratish
        udpSocket = dgram.createSocket('udp4');

        // WebRTC Peer Connection (werift yordamida)
        pc = new RTCPeerConnection({
          codecs: {
            audio: [
              new RTCRtpCodecParameters({
                mimeType: 'audio/opus',
                clockRate: 48000,
                channels: 2,
              }),
            ],
            video: [
              new RTCRtpCodecParameters({
                mimeType: 'video/VP8',
                clockRate: 90000,
              }),
            ],
          },
        });

        // Audio & Video tracklarni qabul qilish
        pc.ontrack = (event) => {
          const track = event.track;
          console.log(`[VoiceProxy] WebRTC track received: ${track.kind}`);

          track.onReceiveRtp.subscribe((rtp) => {
            // RTP payloadni olib shifrlash
            const payload = rtp.payload;

            // AES-256-CTR IV (seqNo orqali)
            const iv = Buffer.alloc(16);
            iv.writeUInt32BE(seqNo++, 0);

            const cipher = crypto.createCipheriv('aes-256-ctr', encryptKey, iv);
            const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);

            // Telegram VoIP paketi (peerTag + seqNo + encryptedPayload)
            const packetHeader = Buffer.alloc(20);
            peerTag.copy(packetHeader, 0, 0, 16);
            packetHeader.writeUInt32BE(seqNo, 16);

            const packet = Buffer.concat([packetHeader, encrypted]);

            udpSocket.send(packet, relayInfo.port, relayInfo.ip, (err) => {
              if (err) console.warn('[VoiceProxy] UDP send error:', err.message);
            });
          });
        };

        // Remote description (client offer) o'rnatish
        await pc.setRemoteDescription(msg.sdp);

        // Local answer yaratish
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // Clientga Answer yuborish
        ws.send(JSON.stringify({
          type: 'answer',
          sdp: pc.localDescription,
        }));

        // ── Telegram Relaydan kelgan paketlarni tinglash ──
        const remoteAudioTrack = new MediaStreamTrack({ kind: 'audio' });
        const remoteVideoTrack = new MediaStreamTrack({ kind: 'video' });
        
        pc.addTrack(remoteAudioTrack);
        pc.addTrack(remoteVideoTrack);

        let audioRtpSeq = 0;
        let audioRtpTs = 0;
        const audioSsrc = 11111;

        let videoRtpSeq = 0;
        let videoRtpTs = 0;
        const videoSsrc = 22222;

        function wrapToRtp(payload, payloadType, seq, ts, ssrc) {
          const rtpHeader = Buffer.alloc(12);
          rtpHeader[0] = 0x80; // Version: 2, Padding/Extension/CSRC: 0
          rtpHeader[1] = payloadType & 0x7F;
          rtpHeader.writeUInt16BE(seq & 0xFFFF, 2);
          rtpHeader.writeUInt32BE(ts, 4);
          rtpHeader.writeUInt32BE(ssrc, 8);
          return Buffer.concat([rtpHeader, payload]);
        }

        udpSocket.on('message', (msg) => {
          if (msg.length < 20) return;

          // Header
          const packetSeqNo = msg.readUInt32BE(16);
          const encryptedPayload = msg.slice(20);

          // Deshifrlash
          const iv = Buffer.alloc(16);
          iv.writeUInt32BE(packetSeqNo, 0);

          const decipher = crypto.createDecipheriv('aes-256-ctr', decryptKey, iv);
          const decrypted = Buffer.concat([decipher.update(encryptedPayload), decipher.final()]);

          // werift tracklariga yozish (RTP formatida)
          const isAudio = decrypted.length < 400; // Sodda audio/video heuristika

          if (isAudio) {
            const rtpPacket = wrapToRtp(decrypted, 111, audioRtpSeq++, audioRtpTs, audioSsrc);
            audioRtpTs += 960; // 20ms frame at 48kHz
            remoteAudioTrack.writeRtp(rtpPacket);
          } else {
            const rtpPacket = wrapToRtp(decrypted, 96, videoRtpSeq++, videoRtpTs, videoSsrc);
            videoRtpTs += 3000; // 33ms frame at 90kHz
            remoteVideoTrack.writeRtp(rtpPacket);
          }
        });

        udpSocket.on('error', (err) => {
          console.error('[VoiceProxy] UDP socket error:', err.message);
        });

        // Telegram relay ga ulanishni bildirish (init hello)
        const initPacket = Buffer.alloc(64);
        peerTag.copy(initPacket, 0, 0, Math.min(16, peerTag.length));
        udpSocket.send(initPacket, relayInfo.port, relayInfo.ip);
      }
    } catch (e) {
      console.error('[VoiceProxy] Signaling error:', e.message);
    }
  });

  ws.on('close', () => {
    console.log(`[VoiceProxy] Client disconnected: ${clientIp}`);
    if (pc) {
      pc.close();
      pc = null;
    }
    if (udpSocket) {
      try { udpSocket.close(); } catch (e) {}
      udpSocket = null;
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`[VoiceProxy] HTTP + WebRTC server running on port ${PORT}`);
});
