/**
 * Telegram Client — Rossiya blokidan himoya + proxy qo'llab-quvvatlash
 *
 * Yangilanishlar:
 *  - Cloudflare Worker orqali proxy (MTProtoWSS)
 *  - DNS-over-HTTPS fallback
 *  - Avtomatik qayta ulanish
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

// Proxy konfiguratsiyasi: Cloudflare Worker yoki MTProxy
function getProxyConfig(): any {
  // 1. Worker proxyni env'dan olish
  const workerUrl = process.env.NEXT_PUBLIC_TG_WORKER_URL;
  if (workerUrl) {
    return {
      transport: 'ws',
      host: workerUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
      port: 443,
    };
  }

  // 2. MTProxy
  const mtproxy = process.env.NEXT_PUBLIC_MT_PROXY;
  if (mtproxy) {
    const [host, port, secret] = mtproxy.split(':');
    return {
      transport: 'tcp',
      host,
      port: parseInt(port) || 443,
      secret,
    };
  }

  // 3. To'g'ridan-to'g'ri (default)
  return undefined;
}

export async function getTelegramClient(): Promise<TgClient> {
  if (_client && (_client as any).connected) return _client;
  if (_connecting) {
    await new Promise((r) => setTimeout(r, 500));
    return getTelegramClient();
  }

  _connecting = true;

  try {
    const { TelegramClient } = await import('telegram');
    const { StringSession } = await import('telegram/sessions');

    const APP_ID = parseInt(process.env.NEXT_PUBLIC_TG_APP_ID || '13292460');
    const APP_HASH = process.env.NEXT_PUBLIC_TG_APP_HASH || '5e211ffc78bd127ad0d784b502e7ce36';

    const sessionStr = getSessionString();
    const session = new StringSession(sessionStr);

    // Proxy sozlamalari
    const proxy = getProxyConfig();

    const client = new TelegramClient(session, APP_ID, APP_HASH, {
      connectionRetries: 10,
      retryDelay: 1000,
      autoReconnect: true,
      useWSS: !!proxy, // Proxy bo'lsa WSS ishlatamiz
      ...(proxy ? { proxy } : {}),
    });

    await client.connect();
    _client = client as unknown as TgClient;

    console.log('[TG] Connected successfully', proxy ? 'via proxy' : 'direct');
    return _client;
  } finally {
    _connecting = false;
  }
}

export async function invokeApi(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const client = await getTelegramClient();

  const { Api } = await import('telegram');

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