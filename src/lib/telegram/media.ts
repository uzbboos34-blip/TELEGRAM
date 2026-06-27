/**
 * Media downloader — gramjs orqali rasm/video/profil fotosuratlarni yuklash
 */

import { getTelegramClient } from './client';
import { getCachedEntity } from './peer-cache';

// ── Keshlar ────────────────────────────────────────────────
const photoCache   = new Map<string, string>(); // peerId_msgId → blob URL
const profileCache = new Map<string, string>(); // peerId → blob URL

// ── Raw message store (media download uchun) ───────────────
export const rawMsgStore = new Map<string, Map<number, unknown>>(); // peerId → msgId → rawMsg

export function storeRawMsg(peerId: string, msgId: number, rawMsg: unknown) {
  if (!rawMsgStore.has(peerId)) rawMsgStore.set(peerId, new Map());
  rawMsgStore.get(peerId)!.set(msgId, rawMsg);
}

export function getRawMsg(peerId: string, msgId: number): unknown | null {
  return rawMsgStore.get(peerId)?.get(msgId) ?? null;
}

// ── Xabar rasmini yuklash ──────────────────────────────────
export async function downloadMessagePhoto(
  peerId: string,
  msgId: number,
  thumbSize = 'x'
): Promise<string | null> {
  const key = `${peerId}_${msgId}`;
  if (photoCache.has(key)) return photoCache.get(key)!;

  try {
    const client = await getTelegramClient();
    const inputEntity = getCachedEntity(peerId);
    if (!inputEntity) return null;

    let rawMsg = getRawMsg(peerId, msgId);
    if (!rawMsg) {
      const fetched = await (client as any).getMessages(inputEntity, { ids: [msgId] });
      rawMsg = fetched?.[0] ?? null;
    }
    if (!rawMsg) return null;

    const msg = rawMsg as any;
    const isSticker = msg.media?.document?.attributes?.some((a: any) => a.className === 'DocumentAttributeSticker');

    const data = await (client as any).downloadMedia(rawMsg, {
      workers: 1,
      thumbSize: isSticker ? undefined : (thumbSize as any),
    });
    if (!data?.length) return null;

    const mime = msg.media?.document?.mimeType ?? 'image/jpeg';
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    photoCache.set(key, url);
    return url;
  } catch (e: any) {
    if (!String(e).includes('cancelled')) {
      console.warn('[Media] Photo download error:', e?.message ?? e);
    }
    return null;
  }
}

// ── Profil fotosuratini yuklash ──────────────────────────
export async function downloadProfilePhoto(peerId: string): Promise<string | null> {
  if (profileCache.has(peerId)) {
    const cached = profileCache.get(peerId)!;
    return cached || null; // '' means no photo
  }

  try {
    const client = await getTelegramClient();
    const { resolveInputEntity } = await import('./messages');
    const inputEntity = await resolveInputEntity(client, peerId);
    if (!inputEntity) return null;

    const raw = await (client as any).downloadProfilePhoto(inputEntity, { isBig: false });

    // Buffer validatsiya
    if (!raw) { profileCache.set(peerId, ''); return null; }

    // Uint8Array ga aylantirish
    let bytes: Uint8Array;
    if (raw instanceof Uint8Array) {
      bytes = raw;
    } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
      bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    } else if (raw instanceof ArrayBuffer) {
      bytes = new Uint8Array(raw);
    } else {
      profileCache.set(peerId, ''); return null;
    }

    // Minimal hajm tekshirish (bo'sh yoki buzilgan)
    if (bytes.length < 16) { profileCache.set(peerId, ''); return null; }

    // Magic bytes dan MIME aniqlash
    let mime = 'image/jpeg';
    if (bytes[0] === 0xFF && bytes[1] === 0xD8)                     mime = 'image/jpeg';
    else if (bytes[0] === 0x89 && bytes[1] === 0x50)                mime = 'image/png';
    else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) mime = 'image/webp';
    else if (bytes[0] === 0x47 && bytes[1] === 0x49)                mime = 'image/gif';

    const blob = new Blob([bytes as any], { type: mime });
    if (blob.size < 16) { profileCache.set(peerId, ''); return null; }

    const url = URL.createObjectURL(blob);
    profileCache.set(peerId, url);
    return url;
  } catch (e: any) {
    if (!String(e).includes('no photo') && !String(e).includes('cancelled')) {
      console.warn('[Media] Profile photo error:', peerId, e?.message ?? e);
    }
    profileCache.set(peerId, '');
    return null;
  }
}

// ── Ovozli xabar yuborish ─────────────────────────────
export async function sendVoiceMessage(
  peerId: string,
  peerType: string,
  audioBlob: Blob,
  durationSec: number,
): Promise<void> {
  const { getTelegramClient } = await import('./client');
  const { getCachedEntity }   = await import('./peer-cache');
  const { Api }               = await import('telegram');
  const { CustomFile }        = await import('telegram/client/uploads');

  const client = await getTelegramClient();
  let inputEntity = getCachedEntity(peerId);

  if (!inputEntity) {
    try { inputEntity = await (client as any).getInputEntity(peerId); }
    catch { throw new Error('Peer topilmadi'); }
  }

  const { Buffer } = await import('buffer');
  const arrayBuffer = await audioBlob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const file = new CustomFile('voice.ogg', buffer.length, '', buffer);

  await (client as any).sendFile(inputEntity, {
    file,
    voiceNote: true,
    attributes: [
      new Api.DocumentAttributeAudio({
        voice: true,
        duration: Math.round(durationSec),
        title:  undefined,
        performer: undefined,
        waveform: undefined,
      }),
    ],
  });
}

// ── Fayl yuborish ─────────────────────────────────────
export async function sendFileMessage(
  peerId: string,
  peerType: string,
  fileBuffer: ArrayBuffer,
  fileName: string,
  mimeType: string,
): Promise<void> {
  const { getTelegramClient } = await import('./client');
  const { CustomFile }        = await import('telegram/client/uploads');
  const { resolveInputEntity } = await import('./messages');
  const { Buffer }            = await import('buffer');

  const client = await getTelegramClient();
  const inputEntity = await resolveInputEntity(client, peerId, peerType);
  if (!inputEntity) throw new Error('Peer topilmadi');

  const buffer = Buffer.from(fileBuffer);
  const file = new CustomFile(fileName, buffer.length, '', buffer);

  await (client as any).sendFile(inputEntity, {
    file,
    forceDocument: !mimeType.startsWith('image/'),
  });
}

// ── Keshni tozalash ────────────────────────────────────────
export function revokeMediaUrls() {
  for (const url of photoCache.values()) URL.revokeObjectURL(url);
  for (const url of profileCache.values()) URL.revokeObjectURL(url);
  photoCache.clear();
  profileCache.clear();
}
