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
  lastMessageIsOutgoing?: boolean;
  lastMessageRead?: boolean;
  lastMessageIsDocument?: boolean;
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
        let lastMessageIsDocument = false;
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
              else {
                lastMessageIsDocument = true;
                const fileAttr = attrs.find((a: any) => a.className === 'DocumentAttributeFilename');
                lastMessage = fileAttr?.fileName || '📎 Fayl';
              }
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

        const lastMessageIsOutgoing = d.message?.out || false;
        const lastMessageRead = lastMessageIsOutgoing
          ? (d.message.id <= (d.dialog?.readOutboxMaxId ?? 0))
          : true;

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
          lastMessageIsOutgoing,
          lastMessageRead,
          lastMessageIsDocument,
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

// ── 1. Real Call History from Telegram API ─────────────────
export interface TelegramCallItem {
  id: string;
  userId: string;
  name: string;
  type: 'incoming' | 'outgoing' | 'missed';
  dateText: string;
  durationText?: string;
  timestamp: number;
}

export async function getCallHistory(limit = 50): Promise<TelegramCallItem[]> {
  try {
    const client = await getTelegramClient();
    const { Api } = await import('telegram');
    const bigInt = (await import('big-integer')).default;
    const { getCachedPeer } = await import('./peer-cache');

    const result = await client.invoke(
      new Api.messages.Search({
        peer: new Api.InputPeerEmpty(),
        q: '',
        filter: new Api.InputMessagesFilterPhoneCalls({}),
        minDate: 0,
        maxDate: 0,
        offsetId: 0,
        addOffset: 0,
        limit,
        maxId: 0,
        minId: 0,
        hash: bigInt(0) as any,
      })
    );

    if (!result || !(result as any).messages) return [];

    const messages = (result as any).messages;
    const users = (result as any).users || [];
    const userMap = new Map<string, any>();
    for (const u of users) {
      if (u.id) userMap.set(u.id.toString(), u);
    }

    const calls: TelegramCallItem[] = [];

    for (const msg of messages) {
      if (msg.action && msg.action.className === 'MessageActionPhoneCall') {
        const action = msg.action;
        const out = msg.out || false;

        let peerId = '';
        if (msg.peerId && msg.peerId.userId) {
          peerId = msg.peerId.userId.toString();
        } else if (msg.fromId && msg.fromId.userId) {
          peerId = msg.fromId.userId.toString();
        }

        if (!peerId) continue;

        const userObj = userMap.get(peerId);
        let name = 'User ID: ' + peerId;
        if (userObj) {
          name = userObj.title || `${userObj.firstName || ''} ${userObj.lastName || ''}`.trim() || 'Unknown';
          cachePeer(peerId, {
            id: peerId,
            type: 'user',
            inputEntity: userObj,
            name,
            isOnline: false,
          });
        } else {
          const cached = getCachedPeer(peerId);
          if (cached) name = cached.name;
        }

        // Determine call type
        let type: 'incoming' | 'outgoing' | 'missed' = 'incoming';
        if (out) {
          type = 'outgoing';
        } else {
          const reasonClass = action.reason?.className || '';
          if (reasonClass.includes('Missed') || reasonClass.includes('Busy') || reasonClass.includes('Disconnect')) {
            type = 'missed';
          }
        }

        // Format duration
        let durationText = '';
        if (action.duration) {
          const m = Math.floor(action.duration / 60);
          const s = action.duration % 60;
          durationText = m > 0 ? `${m}m ${s}s` : `${s}s`;
        }

        // Format Date text
        const d = new Date(msg.date * 1000);
        const dateText = d.toLocaleString('ru', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });

        calls.push({
          id: msg.id.toString(),
          userId: peerId,
          name,
          type,
          dateText,
          durationText,
          timestamp: msg.date,
        });
      }
    }

    return calls;
  } catch (err) {
    console.error('[CallHistory] Error getting call history:', err);
    return [];
  }
}

// ── 2. Real Stories from Telegram API ──────────────────────
export interface TelegramStoryItem {
  id: string; // Peer ID
  storyId: number;
  name: string;
  avatar: string; // profile photo blob URL or ''
  media: any; // Raw media object to download via downloadStoryMedia
  timestamp: string;
  hasUnread: boolean;
  caption?: string;
}

export async function getStories(): Promise<TelegramStoryItem[]> {
  try {
    const client = await getTelegramClient();
    const { Api } = await import('telegram');

    const result = await client.invoke(new Api.stories.GetAllStories({}));
    if (!result || !(result as any).peerStories) return [];

    const peerStoriesList = (result as any).peerStories;
    const users = (result as any).users || [];
    const chats = (result as any).chats || [];

    const entityMap = new Map<string, any>();
    for (const u of users) if (u.id) entityMap.set(u.id.toString(), { name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'User', entity: u, type: 'user' });
    for (const c of chats) if (c.id) entityMap.set(c.id.toString(), { name: c.title || 'Chat', entity: c, type: c.className === 'Channel' ? 'channel' : 'group' });

    const stories: TelegramStoryItem[] = [];

    for (const ps of peerStoriesList) {
      let peerId = '';
      if (ps.peer && ps.peer.userId) {
        peerId = ps.peer.userId.toString();
      } else if (ps.peer && ps.peer.channelId) {
        peerId = ps.peer.channelId.toString();
      }

      if (!peerId) continue;
      const entityInfo = entityMap.get(peerId);
      if (!entityInfo) continue;

      // Extract stories from this peer
      const items = ps.stories || [];
      for (const item of items) {
        if (item.className === 'StoryItem') {
          // Format timestamp
          const diff = Date.now() - (item.date * 1000);
          const hoursAgo = Math.floor(diff / 3600000);
          let timestamp = `${hoursAgo} hours ago`;
          if (hoursAgo < 1) timestamp = 'yaqinda';
          else if (hoursAgo >= 24) timestamp = `${Math.floor(hoursAgo / 24)} days ago`;

          // Cache the peer
          cachePeer(peerId, {
            id: peerId,
            type: entityInfo.type,
            inputEntity: entityInfo.entity,
            name: entityInfo.name,
            isOnline: false,
          });

          stories.push({
            id: peerId,
            storyId: item.id,
            name: entityInfo.name,
            avatar: '', // loaded asynchronously by avatar helper
            media: item.media,
            timestamp,
            hasUnread: item.id > (ps.maxReadId || 0),
            caption: item.caption,
          });
        }
      }
    }

    return stories;
  } catch (err) {
    console.error('[Stories] Error fetching stories:', err);
    return [];
  }
}

