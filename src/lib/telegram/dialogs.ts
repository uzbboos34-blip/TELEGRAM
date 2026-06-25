/**
 * Telegram Dialogs — big-integer compatible
 */

import { getTelegramClient } from './client';

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
}

export async function getDialogs(limit = 50): Promise<Dialog[]> {
  try {
    const client = await getTelegramClient();
    const { Api } = await import('telegram');
    const bigInt = (await import('big-integer')).default;

    const result = await client.invoke(
      new Api.messages.GetDialogs({
        offsetDate: 0,
        offsetId: 0,
        offsetPeer: new Api.InputPeerEmpty(),
        limit,
        hash: bigInt(0),
      })
    );

    const dialogs: Dialog[] = [];

    if (
      result instanceof Api.messages.Dialogs ||
      result instanceof Api.messages.DialogsSlice
    ) {
      const { dialogs: rawDialogs, messages, users, chats } = result;

      const usersMap = new Map();
      const chatsMap = new Map();

      for (const u of users) {
        if (u instanceof Api.User) usersMap.set(u.id.toString(), u);
      }
      for (const c of chats) {
        if (c instanceof Api.Chat || c instanceof Api.Channel) {
          chatsMap.set(c.id.toString(), c);
        }
      }

      for (const dialog of rawDialogs) {
        if (!(dialog instanceof Api.Dialog)) continue;
        const peer = dialog.peer;
        let info: Dialog | null = null;

        const lastMsg = messages.find((m) => m instanceof Api.Message) as InstanceType<typeof Api.Message> | undefined;

        if (peer instanceof Api.PeerUser) {
          const u = usersMap.get(peer.userId.toString());
          if (!u) continue;
          info = {
            id: peer.userId.toString(),
            name: [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Unknown',
            lastMessage: lastMsg?.message || '',
            lastMessageDate: lastMsg?.date,
            unreadCount: dialog.unreadCount,
            isGroup: false,
            isChannel: false,
            isBot: u.bot || false,
            online: u.status instanceof Api.UserStatusOnline,
            isPinned: dialog.pinned || false,
            isMuted: false,
            type: u.bot ? 'bot' : 'user',
          };
        } else if (peer instanceof Api.PeerChat) {
          const c = chatsMap.get(peer.chatId.toString());
          if (!c) continue;
          info = {
            id: peer.chatId.toString(),
            name: c.title || 'Guruh',
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
          const ch = chatsMap.get(peer.channelId.toString());
          if (!ch) continue;
          info = {
            id: peer.channelId.toString(),
            name: ch.title || 'Kanal',
            lastMessage: lastMsg?.message || '',
            lastMessageDate: lastMsg?.date,
            unreadCount: dialog.unreadCount,
            isGroup: !ch.broadcast,
            isChannel: ch.broadcast || false,
            isBot: false,
            isPinned: dialog.pinned || false,
            isMuted: false,
            type: ch.broadcast ? 'channel' : 'group',
          };
        }

        if (info) dialogs.push(info);
      }
    }

    return dialogs;
  } catch (error) {
    console.error('[Dialogs] getDialogs error:', error);
    return [];
  }
}
