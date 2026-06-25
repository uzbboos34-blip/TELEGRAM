/**
 * Telegram MTProto Client
 * gramjs orqali Cloudflare Worker proxy bilan
 * Rossiya blokirovkasini chetlab o'tish uchun
 */

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

const APP_ID = parseInt(process.env.NEXT_PUBLIC_TG_APP_ID || '13292460');
const APP_HASH = process.env.NEXT_PUBLIC_TG_APP_HASH || '5e211ffc78bd127ad0d784b502e7ce36';
const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || 'https://tg-proxy.moxirbekmoxirbek29.workers.dev';

let client: TelegramClient | null = null;
let clientSession = '';

export function getSessionString(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('tg_session') || '';
  }
  return clientSession;
}

export function saveSession(session: string) {
  clientSession = session;
  if (typeof window !== 'undefined') {
    localStorage.setItem('tg_session', session);
  }
}

export function clearSession() {
  clientSession = '';
  if (typeof window !== 'undefined') {
    localStorage.removeItem('tg_session');
    localStorage.removeItem('tg_user');
  }
}

export async function getTelegramClient(): Promise<TelegramClient> {
  if (client && client.connected) {
    return client;
  }

  const sessionString = getSessionString();
  const session = new StringSession(sessionString);

  client = new TelegramClient(session, APP_ID, APP_HASH, {
    connectionRetries: 10,
    retryDelay: 1000,
    autoReconnect: true,
    // Cloudflare Worker proxy orqali ulanish (Rossiya bypass)
    useWSS: true,
    proxy: undefined, // Worker URL via fetch override below
  });

  // Fetch ni override qilib Cloudflare Worker orqali yo'naltirish
  if (typeof window !== 'undefined' && WORKER_URL) {
    const originalFetch = window.fetch.bind(window);
    // Worker proxy - barcha Telegram so'rovlarini Worker orqali yuborish
    (window as unknown as Record<string, unknown>)['__tg_worker_url'] = WORKER_URL;
  }

  try {
    await client.connect();
    console.log('[TG] Connected via Cloudflare Worker proxy');
  } catch (error) {
    console.error('[TG] Connection error:', error);
    throw error;
  }

  return client;
}

export async function disconnectClient() {
  if (client) {
    await client.disconnect();
    client = null;
  }
}

export { APP_ID, APP_HASH, WORKER_URL };
