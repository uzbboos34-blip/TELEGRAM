/**
 * Telegram Dialogs (Chatlar ro'yxati)
 */

import { getTelegramClient } from './client';
import { Api } from 'telegram';

export interface Dialog {
  id: string;
  name: string;
  lastMessage?: string;
  lastMessageDate?: number;
  unreadCount: number;
  isGroup: boolean;
  isChannel: boolean;
  isBot: boolean;
  photo?: string;
  online?: boolean;
  lastSeen?: number;
  isPinned: boolean;
  isMuted: boolean;
  type: 'user' | 'group' | 'channel' | 'bot';
}

export async function getDialogs(limit = 50): Promise<Dialog[]> {
  try {
    const client = await getTelegramClient();

    const result = await client.invoke(
      new Api.messages.GetDialogs({
        offsetDate: 0,
        offsetId: 0,
        offsetPeer: new Api.InputPeerEmpty(),
        limit: limit,
        hash: BigInt(0),
      })
    );

    const dialogs: Dialog[] = [];

    if (result instanceof Api.messages.Dialogs || result instanceof Api.messages.DialogsSlice) {
      const { dialogs: rawDialogs, messages, users, chats } = result;

      const usersMap = new Map<string, Api.User>();
      const chatsMap = new Map<string, Api.Chat | Api.Channel>();

      for (const user of users) {
        if (user instanceof Api.User) {
          usersMap.set(user.id.toString(), user);
        }
      }
      for (const chat of chats) {
        if (chat instanceof Api.Chat || chat instanceof Api.Channel) {
          chatsMap.set(chat.id.toString(), chat);
        }
      }

      for (const dialog of rawDialogs) {
        if (!(dialog instanceof Api.Dialog)) continue;

        const peer = dialog.peer;
        let dialogInfo: Dialog | null = null;

        const lastMsg = messages.find((m) => {
          if (!(m instanceof Api.Message)) return false;
          if (peer instanceof Api.PeerUser) {
            return (
              (m.fromId instanceof Api.PeerUser &&
                m.fromId.userId.toString() === peer.userId.toString()) ||
              m.peerId instanceof Api.PeerUser
            );
          }
          if (peer instanceof Api.PeerChat) {
            return m.peerId instanceof Api.PeerChat;
          }
          return false;
        }) as Api.Message | undefined;

        if (peer instanceof Api.PeerUser) {
          const user = usersMap.get(peer.userId.toString());
          if (!user) continue;

          dialogInfo = {
            id: peer.userId.toString(),
            name: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Unknown',
            lastMessage: lastMsg?.message || '',
            lastMessageDate: lastMsg?.date,
            unreadCount: dialog.unreadCount,
            isGroup: false,
            isChannel: false,
            isBot: user.bot || false,
            online: user.status instanceof Api.UserStatusOnline,
            isPinned: dialog.pinned || false,
            isMuted: false,
            type: user.bot ? 'bot' : 'user',
          };
        } else if (peer instanceof Api.PeerChat) {
          const chat = chatsMap.get(peer.chatId.toString()) as Api.Chat | undefined;
          if (!chat) continue;

          dialogInfo = {
            id: peer.chatId.toString(),
            name: chat.title || 'Group',
            lastMessage: lastMsg?.message || '',
            lastMessageDate: lastMsg?.date,
            unreadCount: dialog.unreadCount,
            isGroup: true,
            isChannel: false,
            isBot: false,
            isPinned: dialog.pinned || false,
            isMuted: false,
            type: 'group',
          };
        } else if (peer instanceof Api.PeerChannel) {
          const channel = chatsMap.get(peer.channelId.toString()) as Api.Channel | undefined;
          if (!channel) continue;

          dialogInfo = {
            id: peer.channelId.toString(),
            name: channel.title || 'Channel',
            lastMessage: lastMsg?.message || '',
            lastMessageDate: lastMsg?.date,
            unreadCount: dialog.unreadCount,
            isGroup: !channel.broadcast,
            isChannel: channel.broadcast || false,
            isBot: false,
            isPinned: dialog.pinned || false,
            isMuted: false,
            type: channel.broadcast ? 'channel' : 'group',
          };
        }

        if (dialogInfo) {
          dialogs.push(dialogInfo);
        }
      }
    }

    return dialogs;
  } catch (error) {
    console.error('[Dialogs] getDialogs error:', error);
    return [];
  }
}

export async function searchDialogs(query: string): Promise<Dialog[]> {
  try {
    const client = await getTelegramClient();
    const result = await client.invoke(
      new Api.contacts.Search({
        q: query,
        limit: 20,
      })
    );

    // Search result parsing
    return [];
  } catch (error) {
    console.error('[Dialogs] searchDialogs error:', error);
    return [];
  }
}
