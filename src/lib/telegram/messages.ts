/**
 * Telegram Messages
 * Xabarlarni yuborish va olish
 */

import { getTelegramClient } from './client';
import { Api } from 'telegram';

export interface Message {
  id: number;
  text: string;
  date: number;
  fromId?: string;
  isOutgoing: boolean;
  isRead: boolean;
  replyToMsgId?: number;
  media?: MessageMedia;
  reactions?: MessageReaction[];
  forwarded?: boolean;
  editDate?: number;
}

export interface MessageMedia {
  type: 'photo' | 'video' | 'audio' | 'document' | 'sticker' | 'gif';
  fileId?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  duration?: number;
  thumbnail?: string;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  isOwn: boolean;
}

function parseMessage(msg: Api.Message): Message {
  let media: MessageMedia | undefined;

  if (msg.media) {
    if (msg.media instanceof Api.MessageMediaPhoto) {
      media = { type: 'photo' };
    } else if (msg.media instanceof Api.MessageMediaDocument) {
      const doc = msg.media.document;
      if (doc instanceof Api.Document) {
        const mimeType = doc.mimeType;
        if (mimeType.startsWith('video/')) {
          media = { type: 'video', mimeType, fileSize: Number(doc.size) };
        } else if (mimeType.startsWith('audio/')) {
          media = { type: 'audio', mimeType, fileSize: Number(doc.size) };
        } else {
          media = { type: 'document', mimeType, fileSize: Number(doc.size) };
        }
      }
    }
  }

  return {
    id: msg.id,
    text: msg.message || '',
    date: msg.date,
    fromId: msg.fromId?.toString(),
    isOutgoing: msg.out || false,
    isRead: !msg.unread,
    replyToMsgId: msg.replyTo?.replyToMsgId,
    media,
    forwarded: !!msg.fwdFrom,
    editDate: msg.editDate,
  };
}

export async function getMessages(
  peerId: string,
  peerType: 'user' | 'group' | 'channel',
  limit = 50,
  offsetId = 0
): Promise<Message[]> {
  try {
    const client = await getTelegramClient();

    let inputPeer: Api.TypeInputPeer;
    if (peerType === 'user') {
      inputPeer = new Api.InputPeerUser({ userId: BigInt(peerId), accessHash: BigInt(0) });
    } else if (peerType === 'group') {
      inputPeer = new Api.InputPeerChat({ chatId: BigInt(peerId) });
    } else {
      inputPeer = new Api.InputPeerChannel({ channelId: BigInt(peerId), accessHash: BigInt(0) });
    }

    const result = await client.invoke(
      new Api.messages.GetHistory({
        peer: inputPeer,
        offsetId,
        offsetDate: 0,
        addOffset: 0,
        limit,
        maxId: 0,
        minId: 0,
        hash: BigInt(0),
      })
    );

    if (result instanceof Api.messages.Messages || result instanceof Api.messages.MessagesSlice || result instanceof Api.messages.ChannelMessages) {
      return result.messages
        .filter((m): m is Api.Message => m instanceof Api.Message)
        .map(parseMessage)
        .reverse();
    }

    return [];
  } catch (error) {
    console.error('[Messages] getMessages error:', error);
    return [];
  }
}

export async function sendMessage(
  peerId: string,
  peerType: 'user' | 'group' | 'channel',
  text: string,
  replyToMsgId?: number
): Promise<Message | null> {
  try {
    const client = await getTelegramClient();

    let inputPeer: Api.TypeInputPeer;
    if (peerType === 'user') {
      inputPeer = new Api.InputPeerUser({ userId: BigInt(peerId), accessHash: BigInt(0) });
    } else if (peerType === 'group') {
      inputPeer = new Api.InputPeerChat({ chatId: BigInt(peerId) });
    } else {
      inputPeer = new Api.InputPeerChannel({ channelId: BigInt(peerId), accessHash: BigInt(0) });
    }

    const result = await client.invoke(
      new Api.messages.SendMessage({
        peer: inputPeer,
        message: text,
        randomId: BigInt(Math.floor(Math.random() * 1e15)),
        replyTo: replyToMsgId
          ? new Api.InputReplyToMessage({ replyToMsgId })
          : undefined,
        noWebpage: true,
      })
    );

    console.log('[Messages] sent:', result);
    return null;
  } catch (error) {
    console.error('[Messages] sendMessage error:', error);
    return null;
  }
}

export async function markAsRead(
  peerId: string,
  peerType: 'user' | 'group' | 'channel',
  maxId: number
): Promise<void> {
  try {
    const client = await getTelegramClient();

    let inputPeer: Api.TypeInputPeer;
    if (peerType === 'user') {
      inputPeer = new Api.InputPeerUser({ userId: BigInt(peerId), accessHash: BigInt(0) });
    } else if (peerType === 'group') {
      inputPeer = new Api.InputPeerChat({ chatId: BigInt(peerId) });
    } else {
      inputPeer = new Api.InputPeerChannel({ channelId: BigInt(peerId), accessHash: BigInt(0) });
    }

    await client.invoke(
      new Api.messages.ReadHistory({
        peer: inputPeer,
        maxId,
      })
    );
  } catch (error) {
    console.error('[Messages] markAsRead error:', error);
  }
}

export async function deleteMessages(
  peerId: string,
  peerType: 'user' | 'group' | 'channel',
  messageIds: number[],
  forEveryone = false
): Promise<void> {
  try {
    const client = await getTelegramClient();

    if (peerType === 'channel') {
      const inputChannel = new Api.InputChannel({ channelId: BigInt(peerId), accessHash: BigInt(0) });
      await client.invoke(
        new Api.channels.DeleteMessages({
          channel: inputChannel,
          id: messageIds,
        })
      );
    } else {
      await client.invoke(
        new Api.messages.DeleteMessages({
          id: messageIds,
          revoke: forEveryone,
        })
      );
    }
  } catch (error) {
    console.error('[Messages] deleteMessages error:', error);
  }
}
