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

    const data = await (client as any).downloadMedia(rawMsg, {
      workers: 1,
      thumbSize: thumbSize as any,
    });
    if (!data?.length) return null;

    const msg = rawMsg as any;
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

// ── Profil fotosuratini yuklash ────────────────────────────
export async function downloadProfilePhoto(peerId: string): Promise<string | null> {
  if (profileCache.has(peerId)) return profileCache.get(peerId)!;

  try {
    const client = await getTelegramClient();
    const inputEntity = getCachedEntity(peerId);
    if (!inputEntity) return null;

    const data = await (client as any).downloadProfilePhoto(inputEntity, { isBig: false });
    if (!data?.length) return null;

    const url = URL.createObjectURL(new Blob([data], { type: 'image/jpeg' }));
    profileCache.set(peerId, url);
    return url;
  } catch (e: any) {
    if (!String(e).includes('no profile photo')) {
      console.warn('[Media] Profile photo error:', peerId, e?.message ?? e);
    }
    return null;
  }
}

// ── Keshni tozalash ────────────────────────────────────────
export function revokeMediaUrls() {
  for (const url of photoCache.values()) URL.revokeObjectURL(url);
  for (const url of profileCache.values()) URL.revokeObjectURL(url);
  photoCache.clear();
  profileCache.clear();
}
