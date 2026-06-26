/**
 * Telegram Messages — gramjs high-level methods
 * Muammo: PEER_ID_INVALID, CHAT_ID_INVALID, CHANNEL_INVALID
 * Yechim: Peer cache dan to'g'ri inputEntity ishlatish
 */

import { getTelegramClient } from './client';
import { getCachedEntity } from './peer-cache';

export interface Message {
  id: number;
  text: string;
  date: number;
  fromId?: string;
  fromName?: string;
  isOutgoing: boolean;
  isRead: boolean;
  replyToMsgId?: number;
  media?: MessageMedia;
  forwarded?: boolean;
  editDate?: number;
}

export interface MessageMedia {
  type: 'photo' | 'video' | 'audio' | 'document' | 'sticker' | 'voice' | 'gif';
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
}

function parseRawMessage(msg: any): Message {
  let media: MessageMedia | undefined;

  if (msg.media) {
    const mc = msg.media.className || '';
    if (mc.includes('Photo')) {
      media = { type: 'photo' };
    } else if (mc.includes('Document')) {
      const doc = msg.media.document;
      const mime = doc?.mimeType || '';
      const attrs = doc?.attributes || [];

      const isVoice = attrs.some((a: any) => a.className === 'DocumentAttributeAudio' && a.voice);
      const isVideo = attrs.some((a: any) => a.className === 'DocumentAttributeVideo');
      const isAnim = attrs.some((a: any) => a.className === 'DocumentAttributeAnimated');
      const isSticker = attrs.some((a: any) => a.className === 'DocumentAttributeSticker');

      const durAttr = attrs.find((a: any) => a.className === 'DocumentAttributeAudio' || a.className === 'DocumentAttributeVideo');
      const fnAttr = attrs.find((a: any) => a.className === 'DocumentAttributeFilename');

      if (isSticker) media = { type: 'sticker' };
      else if (isVoice) media = { type: 'voice', duration: durAttr?.duration };
      else if (isAnim) media = { type: 'gif' };
      else if (isVideo || mime.startsWith('video/')) media = { type: 'video', mimeType: mime, duration: durAttr?.duration };
      else if (mime.startsWith('audio/')) media = { type: 'audio', mimeType: mime, duration: durAttr?.duration };
      else media = { type: 'document', mimeType: mime, fileName: fnAttr?.fileName, fileSize: Number(doc?.size || 0) };
    }
  }

  return {
    id: msg.id,
    text: msg.message || '',
    date: msg.date || 0,
    fromId: msg.fromId?.toString() || msg.peerId?.toString(),
    isOutgoing: msg.out || false,
    isRead: msg.mediaUnread === false,
    replyToMsgId: msg.replyTo?.replyToMsgId,
    media,
    forwarded: !!msg.fwdFrom,
    editDate: msg.editDate,
  };
}

export async function getMessages(
  peerId: string,
  _peerType: string,
  limit = 50,
  offsetId = 0
): Promise<Message[]> {
  try {
    const client = await getTelegramClient();
    const inputEntity = getCachedEntity(peerId);

    if (!inputEntity) {
      console.warn('[Messages] Peer not in cache, skipping:', peerId);
      return [];
    }

    // gramjs high-level getMessages — accessHash avtomatik
    const result = await (client as any).getMessages(inputEntity, {
      limit,
      offsetId: offsetId || undefined,
    });

    return result
      .filter((m: any) => m.className === 'Message')
      .map(parseRawMessage)
      .reverse();
  } catch (error: any) {
    console.error('[Messages] getMessages error:', error?.message || error);
    return [];
  }
}

export async function sendMessage(
  peerId: string,
  _peerType: string,
  text: string,
  replyToMsgId?: number
): Promise<void> {
  try {
    const client = await getTelegramClient();
    const inputEntity = getCachedEntity(peerId);

    if (!inputEntity) {
      throw new Error('Peer cache topilmadi. Avval dialog ro\'yxatini yangilang.');
    }

    await (client as any).sendMessage(inputEntity, {
      message: text,
      replyTo: replyToMsgId || undefined,
    });
  } catch (error: any) {
    console.error('[Messages] sendMessage error:', error?.message || error);
    throw error;
  }
}

export async function markAsRead(
  peerId: string,
  _peerType: string,
  maxId: number
): Promise<void> {
  try {
    const client = await getTelegramClient();
    const inputEntity = getCachedEntity(peerId);
    if (!inputEntity) return;

    const { Api } = await import('telegram');
    const bigInt = (await import('big-integer')).default;

    await (client as any).invoke(
      new Api.messages.ReadHistory({
        peer: inputEntity as any,
        maxId,
      })
    );
  } catch (e: any) {
    console.warn('[Messages] markAsRead error:', e?.message);
  }
}
