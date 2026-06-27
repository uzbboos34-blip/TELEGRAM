/**
 * Group Call — Telegram Video Call API (phone.createGroupCall / joinGroupCall)
 *
 * Video qo'ng'iroqni Telegram Video Call sifatida ulash.
 * Eslatma: bu frontend yordamchi; audio/video oqimlari WebRTC orqali,
 * lekin qo'ng'iroq obyekti Telegramning GroupCall ichida yaratiladi.
 */

import { getTelegramClient } from './client';
import { getCachedEntity } from './peer-cache';

export async function createGroupCall(
  peerId: string,
  peerType: string,
  isVideo: boolean
): Promise<{ call: any; id: string }> {
  const client = await getTelegramClient();
  const input = getCachedEntity(peerId);
  if (!input) throw new Error('Peer topilmadi');

  const { Api }: any = await import('telegram');

  const call: any = await (client as any).invoke(
    new Api.phone.CreateGroupCall({
      peer: input as any,
      rtmpStream: false,
      title: isVideo ? 'Video qo\'ng\'iroq' : 'Ovozli qo\'ng\'iroq',
    })
  );

  return { call, id: call.id?.toString?.() || String(call.id || Date.now()) };
}

export async function joinGroupCall(
  peerId: string,
  peerType: string,
  callId: string,
  isVideo: boolean,
  muted?: boolean,
  joinAs?: any
): Promise<void> {
  const client = await getTelegramClient();
  const input = getCachedEntity(peerId);
  if (!input) throw new Error('Peer topilmadi');

  const { Api }: any = await import('telegram');

  const participant = joinAs || {
    userId: (input as any).userId ?? (input as any).user_id ?? input,
  };

  await (client as any).invoke(
    new Api.phone.JoinGroupCall({
      call: new Api.InputGroupCall({
        id: BigInt(callId),
        accessHash: BigInt(0),
      }),
      peer: input as any,
      muted: !!muted,
      videoStopped: !isVideo,
      inviteHash: '',
      params: '',
    })
  );
}

export async function leaveGroupCall(
  peerId: string,
  peerType: string,
  callId: string
): Promise<void> {
  const client = await getTelegramClient();
  const input = getCachedEntity(peerId);
  if (!input) return;

  const { Api }: any = await import('telegram');

  await (client as any).invoke(
    new Api.phone.LeaveGroupCall({
      call: new Api.InputGroupCall({
        id: BigInt(callId),
        accessHash: BigInt(0),
      }),
      peer: input as any,
      source: 0,
    })
  );
}