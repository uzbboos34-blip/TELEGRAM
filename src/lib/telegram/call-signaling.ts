/**
 * Call Signaling — MTProto Phone API orqali
 *
 * Signaling chat xabari o'rniga phone.requestCall/acceptCall API orqali,
 * shuning uchun "📞RC:" prefiksli xabarlar chatda ko'rinmaydi.
 */

import { getTelegramClient } from './client';
import { getCachedEntity } from './peer-cache';

export interface SignalPayload {
  type: 'offer' | 'answer' | 'ice' | 'end' | 'reject';
  callId: string;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  video?: boolean;
  callerName?: string;
}

function encodeSignal(p: SignalPayload): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(p));
}

function decodeSignal(raw: Uint8Array): SignalPayload | null {
  try { return JSON.parse(new TextDecoder().decode(raw)) as SignalPayload; }
  catch { return null; }
}

// Qo'ng'iroq boshlash — accessHash ni qaytarish uchun wrapper
export async function requestCall(
  peerId: string,
  peerType: string,
  payload: SignalPayload
): Promise<{ accessHash: bigint }> {
  const client = await getTelegramClient();
  const inputUser = getCachedEntity(peerId);

  if (!inputUser) {
    throw new Error('Peer topilmadi. Oldin kontaktni yuklang.');
  }

  const { Api }: any = await import('telegram');
  const Phone = (Api as any).phone;

  const res: any = await (client as any).invoke(
    new Phone.RequestCall({
      userId: inputUser as any,
      randomId: Math.floor(Math.random() * 0x7fffffff),
      gAOrB: encodeSignal(payload),
      protocol: new Phone.PhoneCallProtocol({
        udpP2p: true,
        tcpP2p: true,
        libraryVersions: ['1.0'],
      }),
    })
  );

  const phoneCall = res.phoneCall || res;
  const accessHash = phoneCall.accessHash ?? BigInt(0);
  return { accessHash };
}

// Qabul qilish
export async function acceptCall(
  peerId: string,
  peerType: string,
  payload: SignalPayload
): Promise<void> {
  const client = await getTelegramClient();
  const inputUser = getCachedEntity(peerId);

  if (!inputUser) {
    throw new Error('Peer topilmadi. Oldin kontaktni yuklang.');
  }

  const { Api }: any = await import('telegram');
  const Phone = (Api as any).phone;

  await (client as any).invoke(
    new Phone.AcceptCall({
      peer: new Phone.InputPhoneCall({
        id: BigInt(payload.callId.replace('rc_', '')),
        accessHash: BigInt(0),
      }),
      gB: encodeSignal(payload),
      protocol: new Phone.PhoneCallProtocol({
        udpP2p: true,
        tcpP2p: true,
        libraryVersions: ['1.0'],
      }),
    })
  );
}

// Rad etish
export async function rejectCall(
  peerId: string,
  peerType: string,
  payload: SignalPayload
): Promise<void> {
  const client = await getTelegramClient();
  const inputUser = getCachedEntity(peerId);

  if (!inputUser) {
    throw new Error('Peer topilmadi.');
  }

  const { Api }: any = await import('telegram');
  const Phone = (Api as any).phone;

  await (client as any).invoke(
    new Phone.DiscardCall({
      peer: new Phone.InputPhoneCall({
        id: BigInt(payload.callId.replace('rc_', '')),
        accessHash: BigInt(0),
      }),
      duration: 0,
      reason: new Phone.PhoneCallDiscardReasonMissed(),
      connectionId: '',
    })
  );
}

// Qo'ng'iroqni tugatish
export async function endCall(
  peerId: string,
  peerType: string,
  payload: SignalPayload
): Promise<void> {
  const client = await getTelegramClient();

  try {
    const { Api }: any = await import('telegram');
    const Phone = (Api as any).phone;

    await (client as any).invoke(
      new Phone.DiscardCall({
        peer: new Phone.InputPhoneCall({
          id: BigInt(payload.callId.replace('rc_', '')),
          accessHash: BigInt(0),
        }),
        duration: 0,
        reason: new Phone.PhoneCallDiscardReasonHangup(),
        connectionId: '',
      })
    );
  } catch {
    // Agar xatolik bo'lsa, bekor qilamiz
  }
}

// Kiruvchi signalni handler orqali tayyorlash
export function setupSignalHandler(
  onSignal: (peerId: string, payload: SignalPayload) => void
): void {
  const client = getTelegramClient();

  const handler = async (update: any) => {
    if (update.className === 'UpdatePhoneCall') {
      const pc = update.phoneCall;
      if (!pc) return;

      const rawData = pc.gAOrB || pc.gB || new Uint8Array(0);
      const payload = decodeSignal(rawData);
      if (!payload) return;

      const peerId = (pc.participantId || pc.adminId || pc.userId)?.toString() || '';

      if (peerId && payload) {
        onSignal(peerId, payload);
      }
    }
  };

  (client as any).addEventHandler(handler, {});
}