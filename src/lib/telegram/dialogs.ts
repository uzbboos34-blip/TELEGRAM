/**
 * Telegram Dialogs — gramjs getDialogs() + to'g'ri status parsing
 */

import { getTelegramClient } from './client';
import { cachePeer, parseUserStatus } from './peer-cache';

export interface Dialog {
  id: string;
  name: string;
  lastMessage?: string;
  lastMessageDate?: number;
  unreadCount: number;
  isGroup: boolean;
  isChannel: boolean;
  isBot: boolean;
  online?: boolean;
  statusText?: string;
  isPinned: boolean;
  isMuted: boolean;
  type: 'user' | 'group' | 'channel' | 'bot';
  memberCount?: number;
}

export async function getDialogs(limit = 100): Promise<Dialog[]> {
  try {
    const client = await getTelegramClient();
    const rawDialogs = await (client as any).getDialogs({ limit, archived: false });

    const dialogs: Dialog[] = [];

    for (const d of rawDialogs) {
      try {
        const entity = d.entity;
        if (!entity) continue;

        const id = entity.id?.toString();
        if (!id) continue;

        // ── Peer turlari ───────────────────────────────────
        let type: Dialog['type'] = 'user';
        let isGroup = false, isChannel = false, isBot = false;

        if (entity.className === 'User') {
          isBot = entity.bot || false;
          type  = isBot ? 'bot' : 'user';
        } else if (entity.className === 'Chat') {
          isGroup = true; type = 'group';
        } else if (entity.className === 'Channel') {
          if (entity.megagroup || entity.gigagroup) {
            isGroup = true; type = 'group';
          } else {
            isChannel = true; type = 'channel';
          }
        }

        // ── Online status ──────────────────────────────────
        const { isOnline, text: statusText } = parseUserStatus(entity.status);

        // ── Member count ───────────────────────────────────
        const memberCount = entity.participantsCount ??
          (isGroup || isChannel ? entity.membersCount : undefined);

        // ── InputEntity keshga saqlash ─────────────────────
        cachePeer(id, {
          id, type,
          inputEntity: d.inputEntity,
          name: d.title || entity.firstName || 'Unknown',
          isBot,
          isOnline,
          statusText,
          memberCount,
        });

        // ── Oxirgi xabar ──────────────────────────────────
        let lastMessage = '';
        if (d.message) {
          if (d.message.message) {
            if (d.message.message.startsWith('📞RC:') || d.message.message.startsWith('📞 RC:')) {
              lastMessage = '📞 Qo\'ng\'iroq';
            } else {
              lastMessage = d.message.message;
            }
          } else if (d.message.media) {
            const mc = d.message.media.className || '';
            if      (mc.includes('Photo'))    lastMessage = '📷 Rasm';
            else if (mc.includes('Document')) {
              const attrs = d.message.media.document?.attributes || [];
              if (attrs.some((a: any) => a.className === 'DocumentAttributeAudio' && a.voice))
                lastMessage = '🎙️ Ovozli xabar';
              else if (attrs.some((a: any) => a.className === 'DocumentAttributeVideo'))
                lastMessage = '🎥 Video';
              else if (attrs.some((a: any) => a.className === 'DocumentAttributeAnimated'))
                lastMessage = '🎞️ GIF';
              else if (attrs.some((a: any) => a.className === 'DocumentAttributeSticker'))
                lastMessage = '🎭 Sticker';
              else
                lastMessage = '📎 Fayl';
            }
            else if (mc.includes('Sticker')) lastMessage = '🎭 Sticker';
            else if (mc.includes('Geo'))     lastMessage = '📍 Joylashuv';
            else if (mc.includes('Contact')) lastMessage = '👤 Kontakt';
            else if (mc.includes('Poll'))    lastMessage = '📊 So\'rovnoma';
            else if (mc.includes('Game'))    lastMessage = '🎮 O\'yin';
            else                              lastMessage = '📎 Media';
          } else if (d.message.action) {
            const ac = d.message.action.className || '';
            if      (ac.includes('ChatCreate'))   lastMessage = '🆕 Guruh yaratildi';
            else if (ac.includes('ChatAddUser'))  lastMessage = '👤 Foydalanuvchi qo\'shildi';
            else if (ac.includes('ChatLeft'))     lastMessage = '👋 Guruhdan chiqdi';
            else if (ac.includes('PhoneCall'))    lastMessage = '📞 Qo\'ng\'iroq';
            else if (ac.includes('Pin'))          lastMessage = '📌 Xabar qadaldi';
            else                                   lastMessage = '📌 Tizim xabari';
          }
        }

        dialogs.push({
          id,
          name: d.title || entity.firstName || 'Unknown',
          lastMessage,
          lastMessageDate: d.message?.date,
          unreadCount: d.dialog?.unreadCount ?? d.unreadCount ?? 0,
          isGroup, isChannel, isBot,
          online: isOnline,
          statusText,
          isPinned: d.dialog?.pinned || false,
          isMuted: false,
          type,
          memberCount,
        });
      } catch (err) {
        console.warn('[Dialogs] Skipping dialog:', err);
      }
    }

    return dialogs;
  } catch (error) {
    console.error('[Dialogs] getDialogs error:', error);
    return [];
  }
}

export async function searchAndCreateChat(query: string): Promise<Dialog | null> {
  try {
    const client = await getTelegramClient();
    const cleanQuery = query.trim().startsWith('@') ? query.trim().slice(1) : query.trim();

    const entity = await (client as any).getEntity(cleanQuery);
    if (!entity) return null;

    const id = entity.id?.toString();
    if (!id) return null;

    let type: Dialog['type'] = 'user';
    let isBot = false;
    let isGroup = false;
    let isChannel = false;

    if (entity.className === 'User') {
      isBot = entity.bot || false;
      type = isBot ? 'bot' : 'user';
    } else if (entity.className === 'Chat') {
      isGroup = true;
      type = 'group';
    } else if (entity.className === 'Channel') {
      if (entity.megagroup || entity.gigagroup) {
        isGroup = true;
        type = 'group';
      } else {
        isChannel = true;
        type = 'channel';
      }
    }

    const { parseUserStatus } = await import('./peer-cache');
    const { isOnline, text: statusText } = parseUserStatus(entity.status);

    const name = entity.title || `${entity.firstName || ''} ${entity.lastName || ''}`.trim() || 'Unknown';

    cachePeer(id, {
      id,
      type,
      inputEntity: entity,
      name,
      isBot,
      isOnline,
      statusText,
    });

    return {
      id,
      name,
      unreadCount: 0,
      isGroup,
      isChannel,
      isBot,
      online: isOnline,
      statusText,
      isPinned: false,
      isMuted: false,
      type,
      lastMessage: 'Suhbat boshlash uchun yozing',
    };
  } catch (e) {
    console.error('[Dialogs] searchAndCreateChat error:', e);
    return null;
  }
}

