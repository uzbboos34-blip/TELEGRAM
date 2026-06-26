/**
 * Telegram Dialogs — gramjs high-level getDialogs()
 * Muammo: accessHash=0 → PEER_ID_INVALID
 * Yechim: getDialogs() entity.inputEntity ishlatish (to'g'ri accessHash bilan)
 */

import { getTelegramClient } from './client';
import { cachePeer } from './peer-cache';

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
  isPinned: boolean;
  isMuted: boolean;
  type: 'user' | 'group' | 'channel' | 'bot';
  photo?: string; // base64 yoki placeholder
}

export async function getDialogs(limit = 100): Promise<Dialog[]> {
  try {
    const client = await getTelegramClient();

    // gramjs high-level getDialogs — accessHash avtomatik hal qilinadi
    const rawDialogs = await (client as any).getDialogs({
      limit,
      archived: false,
    });

    const dialogs: Dialog[] = [];

    for (const d of rawDialogs) {
      try {
        const entity = d.entity;
        if (!entity) continue;

        const id = entity.id?.toString();
        if (!id) continue;

        // Peer turini aniqlash
        let type: Dialog['type'] = 'user';
        let isGroup = false;
        let isChannel = false;
        let isBot = false;

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

        // InputEntity saqlash (accessHash bilan)
        cachePeer(id, {
          id,
          type,
          inputEntity: d.inputEntity,
          name: d.title || entity.firstName || 'Unknown',
          isBot,
          isOnline: entity.status?.className === 'UserStatusOnline',
        });

        // Oxirgi xabar matni
        let lastMessage = '';
        if (d.message) {
          if (d.message.message) {
            lastMessage = d.message.message;
          } else if (d.message.media) {
            const mediaClass = d.message.media.className || '';
            if (mediaClass.includes('Photo')) lastMessage = '📷 Rasm';
            else if (mediaClass.includes('Document')) {
              const mime = d.message.media.document?.mimeType || '';
              if (mime.startsWith('video/')) lastMessage = '🎥 Video';
              else if (mime.startsWith('audio/')) lastMessage = '🎵 Audio';
              else if (mime.includes('gif')) lastMessage = '🎞️ GIF';
              else lastMessage = '📎 Fayl';
            } else if (mediaClass.includes('Sticker')) lastMessage = '🎭 Sticker';
            else if (mediaClass.includes('Voice') || mediaClass.includes('Audio')) lastMessage = '🎙️ Ovozli xabar';
            else if (mediaClass.includes('Video')) lastMessage = '📹 Video xabar';
            else lastMessage = '📎 Media';
          } else if (d.message.action) {
            const actionClass = d.message.action.className || '';
            if (actionClass.includes('ChatCreate')) lastMessage = '🆕 Guruh yaratildi';
            else if (actionClass.includes('ChatAddUser')) lastMessage = '👤 Foydalanuvchi qo\'shildi';
            else lastMessage = '📌 Tizim xabari';
          }
        }

        dialogs.push({
          id,
          name: d.title || entity.firstName || 'Unknown',
          lastMessage,
          lastMessageDate: d.message?.date,
          unreadCount: d.dialog?.unreadCount ?? d.unreadCount ?? 0,
          isGroup,
          isChannel,
          isBot,
          online: entity.status?.className === 'UserStatusOnline',
          isPinned: d.dialog?.pinned || false,
          isMuted: false,
          type,
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
