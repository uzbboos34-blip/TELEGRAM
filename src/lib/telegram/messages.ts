/**
 * Telegram Messages — Dynamic imports, gramjs compatible BigInteger
 */

import { getTelegramClient } from './client';

export interface Message {
  id: number;
  text: string;
  date: number;
  fromId?: string;
  isOutgoing: boolean;
  isRead: boolean;
  replyToMsgId?: number;
  media?: MessageMedia;
  forwarded?: boolean;
  editDate?: number;
}

export interface MessageMedia {
  type: 'photo' | 'video' | 'audio' | 'document' | 'sticker';
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
}

async function makeInputPeer(peerId: string, peerType: 'user' | 'group' | 'channel') {
  const { Api } = await import('telegram');
  const bigInt = (await import('big-integer')).default;

  if (peerType === 'user') {
    return new Api.InputPeerUser({ userId: bigInt(peerId), accessHash: bigInt(0) });
  } else if (peerType === 'group') {
    return new Api.InputPeerChat({ chatId: bigInt(peerId) });
  } else {
    return new Api.InputPeerChannel({ channelId: bigInt(peerId), accessHash: bigInt(0) });
  }
}

export async function getMessages(
  peerId: string,
  peerType: 'user' | 'group' | 'channel',
  limit = 50,
  offsetId = 0
): Promise<Message[]> {
  try {
    const client = await getTelegramClient();
    const { Api } = await import('telegram');
    const bigInt = (await import('big-integer')).default;

    const inputPeer = await makeInputPeer(peerId, peerType);

    const result = await client.invoke(
      new Api.messages.GetHistory({
        peer: inputPeer,
        offsetId,
        offsetDate: 0,
        addOffset: 0,
        limit,
        maxId: 0,
        minId: 0,
        hash: bigInt(0),
      })
    );

    if (
      result instanceof Api.messages.Messages ||
      result instanceof Api.messages.MessagesSlice ||
      result instanceof Api.messages.ChannelMessages
    ) {
      return result.messages
        .filter((m): m is InstanceType<typeof Api.Message> => m instanceof Api.Message)
        .map((msg) => {
          let media: MessageMedia | undefined;

          if (msg.media instanceof Api.MessageMediaPhoto) {
            media = { type: 'photo' };
          } else if (msg.media instanceof Api.MessageMediaDocument) {
            const doc = msg.media.document;
            if (doc instanceof Api.Document) {
              const mime = doc.mimeType;
              if (mime.startsWith('video/')) media = { type: 'video', mimeType: mime };
              else if (mime.startsWith('audio/')) media = { type: 'audio', mimeType: mime };
              else media = { type: 'document', mimeType: mime };
            }
          }

          return {
            id: msg.id,
            text: msg.message || '',
            date: msg.date,
            fromId: (msg as any).fromId?.toString(),
            isOutgoing: msg.out || false,
            isRead: !(msg as any).unread,
            replyToMsgId: (msg as any).replyTo?.replyToMsgId,
            media,
            forwarded: !!(msg as any).fwdFrom,
            editDate: (msg as any).editDate,
          } as Message;
        })
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
): Promise<void> {
  try {
    const client = await getTelegramClient();
    const { Api } = await import('telegram');
    const bigInt = (await import('big-integer')).default;

    const inputPeer = await makeInputPeer(peerId, peerType);
    const randomId = bigInt(Math.floor(Math.random() * 1e15));

    await client.invoke(
      new Api.messages.SendMessage({
        peer: inputPeer,
        message: text,
        randomId,
        replyTo: replyToMsgId
          ? new Api.InputReplyToMessage({ replyToMsgId })
          : undefined,
        noWebpage: true,
      })
    );
  } catch (error) {
    console.error('[Messages] sendMessage error:', error);
    throw error;
  }
}

export async function markAsRead(
  peerId: string,
  peerType: 'user' | 'group' | 'channel',
  maxId: number
): Promise<void> {
  try {
    const client = await getTelegramClient();
    const { Api } = await import('telegram');

    const inputPeer = await makeInputPeer(peerId, peerType);
    await client.invoke(new Api.messages.ReadHistory({ peer: inputPeer, maxId }));
  } catch (e) {
    console.error('[Messages] markAsRead error:', e);
  }
}
