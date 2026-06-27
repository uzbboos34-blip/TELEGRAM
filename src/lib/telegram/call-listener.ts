/**
 * Call Listener — UpdatePhoneCall MTProto eventlarini tinglash
 *
 * Telegram server quyidagi holatlarda UpdatePhoneCall yuboradi:
 *  PhoneCallRequested   → Kiruvchi qo'ng'iroq (jiringlaydi)
 *  PhoneCallAccepted    → Callee qabul qildi → Caller confirmCall chaqiradi
 *  PhoneCall            → Call tasdiqlandi → Audio boshlanadi
 *  PhoneCallDiscarded   → Qo'ng'iroq tugadi / rad etildi
 */

import { getTelegramClient } from './client';
import {
  confirmPhoneCall,
  receivedPhoneCall,
  clearActiveCall,
  getActiveCall,
  type PhoneConnection,
} from './call-signaling';

// Kiruvchi qo'ng'iroq ma'lumotlari
export interface IncomingCallInfo {
  callId: string;
  accessHash: string;
  adminId: string;          // Caller Telegram ID
  participantId: string;    // Biz (Callee) Telegram ID
  gAHash: Uint8Array;       // SHA-256(g_a) — privacy uchun
  isVideo: boolean;
  date: number;
}

// Callback typlar
type OnIncomingCall = (info: IncomingCallInfo) => void;
type OnCallConfirmed = (connections: PhoneConnection[], authKey: Uint8Array) => void;
type OnCallEnded = (reason: string) => void;

let _listenerActive = false;
let _removeListener: (() => void) | null = null;

export function setupCallListener(
  onIncoming: OnIncomingCall,
  onConfirmed: OnCallConfirmed,
  onEnded: OnCallEnded,
): () => void {
  if (_listenerActive) {
    _removeListener?.();
  }

  _listenerActive = true;

  const handler = async (update: any) => {
    // Faqat qo'ng'iroq eventlarini qabul qilamiz
    if (update.className !== 'UpdatePhoneCall') return;

    const pc = update.phoneCall;
    if (!pc) return;

    const className: string = pc.className ?? '';
    console.log('[VoIP Listener] UpdatePhoneCall:', className);

    // ── 1. Kiruvchi qo'ng'iroq ─────────────────────────
    if (className === 'PhoneCallRequested') {
      // Telefon jiringlaydi
      const info: IncomingCallInfo = {
        callId: (pc.id ?? 0).toString(),
        accessHash: (pc.accessHash ?? 0).toString(),
        adminId: (pc.adminId ?? 0).toString(),
        participantId: (pc.participantId ?? 0).toString(),
        gAHash: new Uint8Array(pc.gAHash ?? []),
        isVideo: pc.video ?? false,
        date: pc.date ?? Math.floor(Date.now() / 1000),
      };

      // Serverga "qabul qilindi" bildirish (timeout uchun)
      await receivedPhoneCall(info.callId, info.accessHash).catch(() => {});

      onIncoming(info);
    }

    // ── 2. Callee qabul qildi — Caller confirmCall chaqiradi ──
    if (className === 'PhoneCallAccepted') {
      const activeCall = getActiveCall();
      if (!activeCall?.isCaller) return; // Faqat Caller bu eventni qayta ishlaydi

      try {
        const gB = new Uint8Array(pc.gB ?? []);
        const callId = (pc.id ?? 0).toString();
        const callAccessHash = (pc.accessHash ?? 0).toString();

        const connections = await confirmPhoneCall(callId, callAccessHash, gB, activeCall.video);
        const updatedCall = getActiveCall();

        if (updatedCall?.authKey) {
          onConfirmed(connections, updatedCall.authKey);
        }
      } catch (e) {
        console.error('[VoIP Listener] confirmCall failed:', e);
        onEnded('error');
      }
    }

    // ── 3. Qo'ng'iroq to'liq tasdiqlandi (Callee tomoni) ──
    if (className === 'PhoneCall') {
      const activeCall = getActiveCall();
      if (!activeCall || activeCall.isCaller) return; // Faqat Callee

      const connections: PhoneConnection[] = parseConnections(pc.connections ?? []);
      activeCall.connections = connections;

      if (activeCall.authKey) {
        onConfirmed(connections, activeCall.authKey);
      }
    }

    // ── 4. Qo'ng'iroq tugadi ──────────────────────────
    if (className === 'PhoneCallDiscarded') {
      const reason: string =
        pc.reason?.className?.replace('PhoneCallDiscardReason', '').toLowerCase() ?? 'unknown';

      console.log('[VoIP Listener] Call discarded. reason:', reason);
      clearActiveCall();
      onEnded(reason);
    }
  };

  // gramjs event handler
  (getTelegramClient() as any).then(async (client: any) => {
    const { Raw } = await import('telegram/events');
    client.addEventHandler(handler, new Raw({}));
  });

  _removeListener = () => {
    (getTelegramClient() as any).then(async (client: any) => {
      const { Raw } = await import('telegram/events');
      client.removeEventHandler(handler, new Raw({}));
    });
    _listenerActive = false;
  };

  return _removeListener;
}

// ── Relay serverlarni parse qilish ───────────────────────
function parseConnections(raw: any[]): PhoneConnection[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c: any, i: number) => ({
    id: BigInt(c.id ?? i),
    ip: c.ip ?? c.ipv4 ?? '',
    ipv6: c.ipv6 ?? undefined,
    port: c.port ?? 442,
    peerTag: new Uint8Array(c.peerTag ?? new Array(16).fill(0)),
    isTcpReflector: c.isTcpReflector ?? false,
  }));
}
