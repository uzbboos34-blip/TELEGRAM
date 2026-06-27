/**
 * Telegram Voice Proxy Server
 *
 * Browser UDP yubora olmaydi.
 * Bu server WebSocket orqali kelgan audio paketlarni
 * Telegram Relay serverga UDP orqali yuboradi va aksincha.
 *
 * Ishga tushirish:
 *   node voice-proxy/server.js
 *
 * ENV:
 *   PORT=8080 (default)
 */

const WebSocket = require('ws');
const dgram = require('dgram');

const PORT = parseInt(process.env.PORT || '8080');

const wss = new WebSocket.Server({ port: PORT });

console.log(`[VoiceProxy] WebSocket server started on port ${PORT}`);

wss.on('connection', (ws) => {
  console.log('[VoiceProxy] New client connected');

  let udpSocket = null;
  let relayInfo = null;
  let initialized = false;

  ws.on('message', (rawData, isBinary) => {
    // ── Init xabari (JSON) ─────────────────────────────
    if (!isBinary) {
      try {
        const msg = JSON.parse(rawData.toString());

        if (msg.type === 'init' && !initialized) {
          relayInfo = msg.relay; // { ip, port }
          const peerTag = Buffer.from(msg.peerTag || new Array(16).fill(0));

          console.log(`[VoiceProxy] Connecting to relay ${relayInfo.ip}:${relayInfo.port}`);

          // UDP socket yaratish
          udpSocket = dgram.createSocket('udp4');

          // Kelgan UDP paketlarni WS ga yuborish
          udpSocket.on('message', (packet) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(packet, { binary: true });
            }
          });

          udpSocket.on('error', (err) => {
            console.error('[VoiceProxy] UDP error:', err.message);
          });

          // Telegram relay ga dastlabki "hello" paketi yuborish
          // Relay peerTag bilan 64 baytlik init paketi
          const initPacket = Buffer.alloc(64);
          peerTag.copy(initPacket, 0, 0, Math.min(16, peerTag.length));

          udpSocket.send(initPacket, relayInfo.port, relayInfo.ip, (err) => {
            if (err) {
              console.error('[VoiceProxy] UDP init send error:', err.message);
            } else {
              console.log('[VoiceProxy] UDP init packet sent to relay');
            }
          });

          initialized = true;
        }
      } catch (e) {
        console.warn('[VoiceProxy] Invalid JSON message:', e.message);
      }
      return;
    }

    // ── Binary audio ma'lumoti ─────────────────────────
    if (initialized && udpSocket && relayInfo) {
      udpSocket.send(rawData, relayInfo.port, relayInfo.ip, (err) => {
        if (err) {
          // UDP yuborishda xatolik — log qilib davom et
          console.warn('[VoiceProxy] UDP send error:', err.message);
        }
      });
    }
  });

  ws.on('close', () => {
    console.log('[VoiceProxy] Client disconnected');
    if (udpSocket) {
      udpSocket.close();
      udpSocket = null;
    }
  });

  ws.on('error', (err) => {
    console.error('[VoiceProxy] WS error:', err.message);
  });
});

wss.on('error', (err) => {
  console.error('[VoiceProxy] Server error:', err.message);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[VoiceProxy] Shutting down...');
  wss.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  wss.close(() => process.exit(0));
});
