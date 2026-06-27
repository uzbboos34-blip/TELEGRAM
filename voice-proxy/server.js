/**
 * Telegram Voice Proxy Server — Production Ready
 *
 * Deploy: Render.com, Railway, Fly.io
 *
 * Browser UDP yubora olmaydi.
 * Bu server WebSocket orqali kelgan audio paketlarni
 * Telegram Relay serverga UDP orqali yuboradi va aksincha.
 *
 * Ishga tushirish:
 *   node server.js
 *   PORT=8080 node server.js
 */

const http = require('http');
const WebSocket = require('ws');
const dgram = require('dgram');

const PORT = parseInt(process.env.PORT || '8080');

// HTTP server — health check uchun (Render.com talab qiladi)
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', connections: wss.clients.size }));
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});

// WebSocket server HTTP server ustida
const wss = new WebSocket.Server({
  server: httpServer,
  verifyClient: ({ origin }) => {
    // ALLOWED_ORIGIN env yo'q bo'lsa — hamma domendan qabul qilish
    if (!process.env.ALLOWED_ORIGIN) return true;
    const allowed = [
      process.env.ALLOWED_ORIGIN,
      'http://localhost:3000',
      'https://localhost:3000',
    ];
    return allowed.some(o => origin && origin.startsWith(o));
  },
});

console.log('[VoiceProxy] Starting on port ' + PORT);

wss.on('connection', (ws, req) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log('[VoiceProxy] New client: ' + clientIp);

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

          console.log('[VoiceProxy] Relay: ' + relayInfo.ip + ':' + relayInfo.port);

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

          // Telegram relay ga dastlabki init paketi (peerTag bilan 64 bayt)
          const initPacket = Buffer.alloc(64);
          peerTag.copy(initPacket, 0, 0, Math.min(16, peerTag.length));

          udpSocket.send(initPacket, relayInfo.port, relayInfo.ip, (err) => {
            if (err) {
              console.error('[VoiceProxy] Init packet error:', err.message);
            } else {
              console.log('[VoiceProxy] Init packet sent to relay');
              // Tayyor ekanligini bildirish
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ready' }));
              }
            }
          });

          initialized = true;
        }
      } catch (e) {
        console.warn('[VoiceProxy] Invalid message:', e.message);
      }
      return;
    }

    // ── Binary audio ma'lumoti ─────────────────────────
    if (initialized && udpSocket && relayInfo) {
      udpSocket.send(rawData, relayInfo.port, relayInfo.ip, (err) => {
        if (err) {
          console.warn('[VoiceProxy] UDP send error:', err.message);
        }
      });
    }
  });

  ws.on('close', () => {
    console.log('[VoiceProxy] Client disconnected: ' + clientIp);
    if (udpSocket) {
      try { udpSocket.close(); } catch (e) { /* ignore */ }
      udpSocket = null;
    }
  });

  ws.on('error', (err) => {
    console.error('[VoiceProxy] WS error:', err.message);
  });
});

httpServer.listen(PORT, () => {
  console.log('[VoiceProxy] HTTP + WebSocket server running on port ' + PORT);
  console.log('[VoiceProxy] Health check: http://localhost:' + PORT + '/health');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[VoiceProxy] Shutting down...');
  wss.close(() => {
    httpServer.close(() => process.exit(0));
  });
});

process.on('SIGINT', () => {
  wss.close(() => {
    httpServer.close(() => process.exit(0));
  });
});
