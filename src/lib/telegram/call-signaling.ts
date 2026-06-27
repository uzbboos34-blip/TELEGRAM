/**
 * Call Signaling — MTProto Phone API orqali TO'G'RI implementatsiya
 *
 * MUHIM o'zgarishlar (eski noto'g'ri versiyadan):
 *  - gAOrB ga endi WebRTC SDP EMAS, haqiqiy DH kalit yoziladi
 *  - accessHash to'g'ri saqlanadi va ishlatiladi
 *  - phone.confirmCall to'g'ri chaqiriladi
 *  - Relay server ma'lumotlari (connections) parse qilinadi
 */

import { getTelegramClient } from './client';
import { getCachedEntity } from './peer-cache';
import {
  fetchDHConfig,
  generateCallerKeys,
  generateCalleeKeys,
  computeAuthKey,
  computeKeyFingerprint,
  validateDHParams,
  type DHConfig,
  type CallerKeys,
} from './call-crypto';

// ── Typlar ────────────────────────────────────────────────
export interface PhoneConnection {
  id: bigint;
  ip: string;
  ipv6?: string;
  port: number;
  peerTag: Uint8Array;
  isTcpReflector?: boolean;
}

export interface ActiveCallState {
  callId: bigint;
  accessHash: bigint;
  dhConfig: DHConfig;
  callerKeys: CallerKeys | null;  // Caller uchun (a, gA, gAHash)
  authKey: Uint8Array | null;     // Hisoblangan E2E kalit
  connections: PhoneConnection[]; // Telegram relay serverlari
  isCaller: boolean;
  video: boolean;                 // Video qo'ng'iroqmi yoki yo'q
  startTime: number;
}

// Global aktiv qo'ng'iroq holati
let _activeCall: ActiveCallState | null = null;

export function getActiveCall(): ActiveCallState | null {
  return _activeCall;
}

export function setActiveCall(call: ActiveCallState | null): void {
  _activeCall = call;
}

export function clearActiveCall(): void {
  _activeCall = null;
}

// ── Relay serverlarni parse qilish ───────────────────────
function parseConnections(raw: any[]): PhoneConnection[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c: any, i: number) => ({
    id: BigInt(c.id ?? i),
    ip: c.ip ?? c.ipv4 ?? '',
    ipv6: c.ipv6 ?? undefined,
    port: c.port ?? 442,
    peerTag: c.peerTag
      ? new Uint8Array(c.peerTag)
      : new Uint8Array(16),
    isTcpReflector: c.isTcpReflector ?? false,
  }));
}

// ── PhoneCallProtocol objecti ────────────────────────────
async function makeProtocol(Api: any, video = false) {
  return new Api.PhoneCallProtocol({
    udpP2p: true,
    udpReflector: true,
    minLayer: video ? 114 : 92, // Video uchun min 114 layer kerak
    maxLayer: video ? 120 : 92,
    libraryVersions: ['5.0.0'],
  });
}

// ════════════════════════════════════════════════════════
// 1. CALLER: phone.requestCall — qo'ng'iroq boshlash
// ════════════════════════════════════════════════════════
export async function requestPhoneCall(peerId: string, video = false): Promise<ActiveCallState> {
  const client = await getTelegramClient();
  const { Api } = await import('telegram');

  // Dinamik ravishda to'g'ri InputUser olish (keshdan yoki GramJS ichki sessiyasidan)
  let inputEntity: any;
  try {
    inputEntity = await (client as any).getInputEntity(peerId);
  } catch {
    inputEntity = getCachedEntity(peerId);
  }

  if (!inputEntity) {
    throw new Error(`Peer ${peerId} topilmadi. Avval dialogs yuklang.`);
  }

  // 1. DH konfiguratsiya olish
  const dhConfig = await fetchDHConfig();

  // 2. g_a va g_a_hash hisoblash
  const callerKeys = await generateCallerKeys(dhConfig);

  // 3. phone.requestCall — faqat gAHash yuboriladi (g_a maxfiy)
  const result: any = await (client as any).invoke(
    new (Api as any).phone.RequestCall({
      userId: inputEntity,
      randomId: Math.floor(Math.random() * 0x7fffffff),
      gAHash: callerKeys.gAHash,
      protocol: await makeProtocol(Api, video),
      video: video,
    })
  );

  const phoneCall = result?.phoneCall ?? result;

  _activeCall = {
    callId: BigInt(phoneCall.id ?? 0),
    accessHash: BigInt(phoneCall.accessHash ?? 0),
    dhConfig,
    callerKeys,
    authKey: null,        // PhoneCallAccepted kelganda hisoblanadi
    connections: [],      // PhoneCall confirmed kelganda to'ldiriladi
    isCaller: true,
    video: video,
    startTime: Date.now(),
  };

  console.log('[VoIP] requestCall sent. callId:', _activeCall.callId, 'video:', video);
  return _activeCall;
}

// ════════════════════════════════════════════════════════
// 2. CALLEE: phone.acceptCall — kiruvchi qo'ng'iroqni qabul qilish
// ════════════════════════════════════════════════════════
export async function acceptPhoneCall(
  callId: bigint,
  callAccessHash: bigint,
  gA: Uint8Array, // UpdatePhoneCall.PhoneCallRequested.gAHash dan EMAS, balki PhoneCallAccepted.gA dan
  video = false,
): Promise<ActiveCallState> {
  const client = await getTelegramClient();
  const { Api } = await import('telegram');

  // 1. DH config olish
  const dhConfig = await fetchDHConfig();

  // 2. DH parametrlarni tekshirish
  if (!validateDHParams(dhConfig, gA)) {
    throw new Error('DH parameters validation failed — xavfli qo\'ng\'iroq!');
  }

  // 3. g_b va authKey hisoblash
  const calleeKeys = await generateCalleeKeys(dhConfig, gA);

  // 4. phone.acceptCall — g_b yuboriladi
  const result: any = await (client as any).invoke(
    new (Api as any).phone.AcceptCall({
      peer: new (Api as any).InputPhoneCall({
        id: callId,
        accessHash: callAccessHash,
      }),
      gB: calleeKeys.gB,
      protocol: await makeProtocol(Api, video),
    })
  );

  const phoneCall = result?.phoneCall ?? result;
  const connections = parseConnections(phoneCall?.connections ?? []);

  _activeCall = {
    callId,
    accessHash: callAccessHash,
    dhConfig,
    callerKeys: null,
    authKey: calleeKeys.authKey,  // Callee authKey ni hisobladi
    connections,
    isCaller: false,
    video: video,
    startTime: Date.now(),
  };

  console.log('[VoIP] acceptCall sent. connections:', connections.length, 'video:', video);
  return _activeCall;
}

// ════════════════════════════════════════════════════════
// 3. CALLER: phone.confirmCall — g_b kelganda tasdiqlash
// ════════════════════════════════════════════════════════
export async function confirmPhoneCall(
  callId: bigint,
  callAccessHash: bigint,
  gB: Uint8Array, // PhoneCallAccepted.g_b dan
  video = false,
): Promise<PhoneConnection[]> {
  if (!_activeCall) throw new Error('No active call state');
  if (!_activeCall.callerKeys) throw new Error('No caller keys');

  const client = await getTelegramClient();
  const { Api } = await import('telegram');

  // 1. authKey hisoblash (g_b^a mod p)
  const authKey = computeAuthKey(_activeCall.dhConfig, gB, _activeCall.callerKeys.a);
  _activeCall.authKey = authKey;

  // 2. Key fingerprint
  const keyFingerprint = await computeKeyFingerprint(authKey);

  // 3. phone.confirmCall — g_a (asl qiymat) va fingerprint yuboriladi
  const result: any = await (client as any).invoke(
    new (Api as any).phone.ConfirmCall({
      peer: new (Api as any).InputPhoneCall({
        id: callId,
        accessHash: callAccessHash,
      }),
      gA: _activeCall.callerKeys.gA, // Endi asl g_a yuboriladi
      keyFingerprint,
      protocol: await makeProtocol(Api, video),
    })
  );

  const phoneCall = result?.phoneCall ?? result;
  const connections = parseConnections(phoneCall?.connections ?? []);
  _activeCall.connections = connections;

  console.log('[VoIP] confirmCall sent. authKey ready, connections:', connections.length, 'video:', video);
  return connections;
}

// ════════════════════════════════════════════════════════
// 4. phone.receivedCall — qo'ng'iroq qabul qilindimi bildirish
// ════════════════════════════════════════════════════════
export async function receivedPhoneCall(
  callId: bigint,
  callAccessHash: bigint,
): Promise<void> {
  const client = await getTelegramClient();
  const { Api } = await import('telegram');

  try {
    await (client as any).invoke(
      new (Api as any).phone.ReceivedCall({
        peer: new (Api as any).InputPhoneCall({
          id: callId,
          accessHash: callAccessHash,
        }),
      })
    );
  } catch (e) {
    // Ba'zan server bu methodga xatolik qaytaradi — ignore
    console.warn('[VoIP] receivedCall error (ignorable):', e);
  }
}

// ════════════════════════════════════════════════════════
// 5. phone.discardCall — qo'ng'iroqni rad etish / tugatish
// ════════════════════════════════════════════════════════
export async function discardPhoneCall(
  callId: bigint,
  callAccessHash: bigint,
  reason: 'hangup' | 'missed' | 'busy' | 'disconnect' = 'hangup',
  duration = 0,
): Promise<void> {
  const client = await getTelegramClient();
  const { Api } = await import('telegram');

  const reasons: Record<string, any> = {
    hangup: new (Api as any).phone.PhoneCallDiscardReasonHangup({}),
    missed: new (Api as any).phone.PhoneCallDiscardReasonMissed({}),
    busy: new (Api as any).phone.PhoneCallDiscardReasonBusy({}),
    disconnect: new (Api as any).phone.PhoneCallDiscardReasonDisconnect({}),
  };

  try {
    await (client as any).invoke(
      new (Api as any).phone.DiscardCall({
        peer: new (Api as any).InputPhoneCall({
          id: callId,
          accessHash: callAccessHash,
        }),
        duration,
        reason: reasons[reason],
        connectionId: 0n,
      })
    );
    console.log('[VoIP] discardCall sent. reason:', reason);
  } catch (e) {
    console.warn('[VoIP] discardCall error:', e);
  } finally {
    _activeCall = null;
  }
}