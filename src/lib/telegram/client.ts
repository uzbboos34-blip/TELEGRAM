/**
 * Telegram Client - Lazy loader
 * gramjs faqat browser tomonida dinamik import bilan yuklash
 * Node.js modullarini (fs, net) client bundle'dan chiqarish uchun
 */

export interface TgSession {
  save(): string | Promise<string>;
}

export interface TgClient {
  connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  invoke(request: unknown): Promise<unknown>;
  session: TgSession;
  addEventHandler(handler: (event: any) => void | Promise<void>, event: any): void;
  removeEventHandler(handler: (event: any) => void | Promise<void>, event: any): void;
}

let _client: TgClient | null = null;
let _connecting = false;

export function getSessionString(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('tg_session') || '';
  }
  return '';
}

export function saveSession(session: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('tg_session', session);
  }
}

export function clearSession() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('tg_session');
    localStorage.removeItem('tg_user');
  }
}

export async function getTelegramClient(): Promise<TgClient> {
  if (_client && _client.connected) return _client;
  if (_connecting) {
    await new Promise((r) => setTimeout(r, 500));
    return getTelegramClient();
  }

  _connecting = true;

  try {
    // Dynamic import - faqat browser'da
    const { TelegramClient } = await import('telegram');
    const { StringSession } = await import('telegram/sessions');

    const APP_ID = parseInt(process.env.NEXT_PUBLIC_TG_APP_ID || '13292460');
    const APP_HASH = process.env.NEXT_PUBLIC_TG_APP_HASH || '5e211ffc78bd127ad0d784b502e7ce36';

    const sessionStr = getSessionString();
    const session = new StringSession(sessionStr);

    const client = new TelegramClient(session, APP_ID, APP_HASH, {
      connectionRetries: 10,
      retryDelay: 1000,
      autoReconnect: true,
      useWSS: true,
    });

    await client.connect();
    _client = client as unknown as TgClient;

    console.log('[TG] Connected successfully');
    return _client;
  } finally {
    _connecting = false;
  }
}

export async function invokeApi(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const client = await getTelegramClient();

  // Dynamic import for Api
  const { Api } = await import('telegram');

  // Construct the API call dynamically
  const ApiClass = (Api as Record<string, unknown>)[method];
  if (!ApiClass) throw new Error(`Unknown API method: ${method}`);

  return client.invoke(new (ApiClass as new (params: unknown) => unknown)(params));
}

export async function disconnectClient() {
  if (_client) {
    await _client.disconnect();
    _client = null;
  }
}
