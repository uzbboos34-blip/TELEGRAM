/**
 * Telegram Messages — peer cache miss fix + raw message store
 */

import { getTelegramClient } from './client';
import { getCachedEntity, cachePeer, getCachedPeer } from './peer-cache';
import { storeRawMsg } from './media';

export interface Message {
  id: number;
  text: string;
  date: number;
  fromId?: string;
  senderName?: string;
  isOutgoing: boolean;
  isRead: boolean;
  replyToMsgId?: number;
  media?: MessageMedia;
  forwarded?: boolean;
  editDate?: number;
  phoneCall?: {
    video: boolean;
    reason: 'missed' | 'disconnect' | 'hangup' | 'busy';
    duration?: number;
  };
}

export interface MessageMedia {
  type: 'photo' | 'video' | 'audio' | 'document' | 'sticker' | 'voice' | 'gif';
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
  width?: number;
  height?: number;
}

// ── Peer resolution with fallback ─────────────────────────
export async function resolveInputEntity(
  client: any,
  peerId: string,
  peerType?: string
): Promise<unknown | null> {
  // 1. Check cache first
  let entity = getCachedEntity(peerId);
  if (entity) return entity;

  // 2. Try gramjs getInputEntity — uses session's internal entity cache
  try {
    entity = await client.getInputEntity(peerId);
    if (entity) {
      const type = peerType || (getCachedPeer(peerId)?.type) || 'user';
      cachePeer(peerId, {
        id: peerId,
        type: type as any,
        inputEntity: entity,
        name: getCachedPeer(peerId)?.name || '',
      });
      return entity;
    }
  } catch { /* try next */ }

  // 3. Last resort: load all dialogs to populate cache
  try {
    console.log('[Messages] Loading dialogs to populate cache for peer:', peerId);
    const { getDialogs } = await import('./dialogs');
    await getDialogs(200);
    entity = getCachedEntity(peerId);
    if (entity) return entity;
  } catch { /* give up */ }

  return null;
}

// ── Message parser ─────────────────────────────────────────
export function parseRawMessage(msg: any): Message {
  let media: MessageMedia | undefined;

  if (msg.media) {
    const mc = msg.media.className ?? '';

    if (mc.includes('Photo')) {
      const sizes = msg.media.photo?.sizes ?? [];
      const largest = sizes[sizes.length - 1];
      media = {
        type: 'photo',
        width: largest?.w,
        height: largest?.h,
      };
    } else if (mc.includes('Document')) {
      const doc = msg.media.document;
      const mime: string = doc?.mimeType ?? '';
      const attrs: any[] = doc?.attributes ?? [];

      const isVoice   = attrs.some((a: any) => a.className === 'DocumentAttributeAudio' && a.voice);
      const isVideo   = attrs.some((a: any) => a.className === 'DocumentAttributeVideo');
      const isAnim    = attrs.some((a: any) => a.className === 'DocumentAttributeAnimated');
      const isSticker = attrs.some((a: any) => a.className === 'DocumentAttributeSticker');
      const durAttr   = attrs.find((a: any) => a.className?.includes('Audio') || a.className?.includes('Video'));
      const fnAttr    = attrs.find((a: any) => a.className === 'DocumentAttributeFilename');
      const vidAttr   = attrs.find((a: any) => a.className === 'DocumentAttributeVideo');

      if (isSticker)                               media = { type: 'sticker' };
      else if (isVoice)                            media = { type: 'voice', duration: durAttr?.duration };
      else if (isAnim || mime.includes('gif'))     media = { type: 'gif', mimeType: mime };
      else if (isVideo || mime.startsWith('video')) media = {
        type: 'video', mimeType: mime,
        duration: durAttr?.duration,
        width: vidAttr?.w, height: vidAttr?.h,
        fileSize: Number(doc?.size ?? 0),
      };
      else if (mime.startsWith('audio'))           media = { type: 'audio', mimeType: mime, duration: durAttr?.duration };
      else                                          media = {
        type: 'document', mimeType: mime,
        fileName: fnAttr?.fileName,
        fileSize: Number(doc?.size ?? 0),
      };
    } else if (mc.includes('Geo')) {
      media = { type: 'document', fileName: '📍 Joylashuv' };
    } else if (mc.includes('Contact')) {
      media = { type: 'document', fileName: '👤 Kontakt' };
    } else if (mc.includes('Poll')) {
      media = { type: 'document', fileName: '📊 So\'rovnoma' };
    }
  }

  let phoneCall: Message['phoneCall'] | undefined;

  if (msg.className === 'MessageService') {
    const action = msg.action;
    if (action && action.className === 'MessageActionPhoneCall') {
      const reasonClass = action.reason?.className || '';
      let reason: 'missed' | 'disconnect' | 'hangup' | 'busy' = 'hangup';
      
      if (reasonClass.includes('Missed')) {
        reason = 'missed';
      } else if (reasonClass.includes('Disconnect')) {
        reason = 'disconnect';
      } else if (reasonClass.includes('Busy')) {
        reason = 'busy';
      }

      phoneCall = {
        video: action.video || false,
        reason,
        duration: action.duration,
      };
    }
  }

  const fromIdStr = (msg.fromId ?? msg.peerId)?.toString();
  let senderName = '';
  if (msg.sender) {
    senderName = msg.sender.title || `${msg.sender.firstName || ''} ${msg.sender.lastName || ''}`.trim();
  } else if (msg._sender) {
    senderName = msg._sender.title || `${msg._sender.firstName || ''} ${msg._sender.lastName || ''}`.trim();
  }
  if (!senderName && fromIdStr) {
    senderName = getCachedPeer(fromIdStr)?.name || '';
  }

  return {
    id: msg.id,
    text: msg.message ?? '',
    date: msg.date ?? 0,
    fromId: fromIdStr,
    senderName,
    isOutgoing: msg.out ?? false,
    isRead: !msg.mediaUnread,
    replyToMsgId: msg.replyTo?.replyToMsgId,
    media,
    forwarded: !!msg.fwdFrom,
    editDate: msg.editDate,
    phoneCall,
  };
}

// ── getMessages ────────────────────────────────────────────
export async function getMessages(
  peerId: string,
  peerType: string,
  limit = 50,
  offsetId = 0
): Promise<Message[]> {
  try {
    const client = await getTelegramClient();
    const inputEntity = await resolveInputEntity(client, peerId, peerType);

    if (!inputEntity) {
      console.warn('[Messages] Could not resolve peer:', peerId);
      return [];
    }

    const rawMessages = await (client as any).getMessages(inputEntity, {
      limit,
      offsetId: offsetId || undefined,
    });

    const messages = rawMessages.filter((m: any) => 
      (m.className === 'Message' || m.className === 'MessageService') && 
      !(m.message && (m.message.startsWith('📞RC:') || m.message.startsWith('📞 RC:')))
    );

    // Store raw messages for media download
    for (const msg of messages) {
      if (msg.media) storeRawMsg(peerId, msg.id, msg);
    }

    return messages.map(parseRawMessage).reverse();
  } catch (e: any) {
    console.error('[Messages] getMessages error:', e?.message ?? e);
    return [];
  }
}

// ── sendMessage ────────────────────────────────────────────
export async function sendMessage(
  peerId: string,
  peerType: string,
  text: string,
  replyToMsgId?: number
): Promise<void> {
  const client = await getTelegramClient();
  const inputEntity = await resolveInputEntity(client, peerId, peerType);

  if (!inputEntity) {
    throw new Error('Peer topilmadi. Dialog ro\'yxatini yangilang.');
  }

  await (client as any).sendMessage(inputEntity, {
    message: text,
    replyTo: replyToMsgId || undefined,
  });
}

// ── markAsRead ─────────────────────────────────────────────
export async function markAsRead(
  peerId: string,
  peerType: string,
  maxId: number
): Promise<void> {
  try {
    const client = await getTelegramClient();
    const inputEntity = await resolveInputEntity(client, peerId, peerType);
    if (!inputEntity) return;

    const { Api } = await import('telegram');
    await (client as any).invoke(new Api.messages.ReadHistory({ peer: inputEntity as any, maxId }));
  } catch (e: any) {
    console.warn('[Messages] markAsRead:', e?.message);
  }
}
