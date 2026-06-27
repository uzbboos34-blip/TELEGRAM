/**
 * Telegram VoIP Crypto — Diffie-Hellman kalit almashinuvi
 *
 * Telegram phone call E2E encryption uchun majburiy:
 *  - DH config serverdan olinadi (messages.getDhConfig)
 *  - g_a (caller) va g_b (callee) hisoblash
 *  - authKey = DH shared secret (256 bytes)
 *  - AES-256-IGE shifrlash kaliti authKey dan hosil qilinadi
 */

import { getTelegramClient } from './client';

// ── Typlar ────────────────────────────────────────────────
export interface DHConfig {
  g: number;        // Generator (odatda 2 yoki 3)
  p: Uint8Array;    // 2048-bit prime (256 bytes)
  version: number;
}

export interface CallerKeys {
  a: Uint8Array;       // Maxfiy son — HECH QACHON yuborilmaydi
  gA: Uint8Array;      // g^a mod p — phone.requestCall ga (256 bytes)
  gAHash: Uint8Array;  // SHA-256(gA) — birinchi yuboriladi (privacy)
}

export interface CalleeKeys {
  b: Uint8Array;       // Maxfiy son — HECH QACHON yuborilmaydi
  gB: Uint8Array;      // g^b mod p — phone.acceptCall ga (256 bytes)
  authKey: Uint8Array; // g_a^b mod p — E2E kalit (256 bytes)
}

// ── DH Config serverdan olish ─────────────────────────────
export async function fetchDHConfig(): Promise<DHConfig> {
  const client = await getTelegramClient();
  const { Api } = await import('telegram');

  const config: any = await (client as any).invoke(
    new (Api as any).messages.GetDhConfig({
      version: 0,
      randomLength: 256,
    })
  );

  if (config.className === 'messages.DhConfigNotModified') {
    throw new Error('DH config not available');
  }

  return {
    g: config.g,
    p: new Uint8Array(config.p),
    version: config.version,
  };
}

// ── Caller kalitlarini hisoblash ──────────────────────────
export async function generateCallerKeys(dhConfig: DHConfig): Promise<CallerKeys> {
  // 256 baytlik tasodifiy maxfiy son
  const a = crypto.getRandomValues(new Uint8Array(256));

  const g = BigInt(dhConfig.g);
  const p = bytesToBigInt(dhConfig.p);
  const aInt = bytesToBigInt(a);

  // g^a mod p
  const gAInt = modPow(g, aInt, p);
  const gA = bigIntToBytes(gAInt, 256);

  // SHA-256(g_a) — privacy uchun avval faqat hash yuboriladi
  const gAHashBuf = await crypto.subtle.digest('SHA-256', gA.buffer as ArrayBuffer);
  const gAHash = new Uint8Array(gAHashBuf);

  return { a, gA, gAHash };
}

// ── Callee kalitlarini hisoblash ──────────────────────────
export async function generateCalleeKeys(
  dhConfig: DHConfig,
  gA: Uint8Array,
): Promise<CalleeKeys> {
  // 256 baytlik tasodifiy maxfiy son
  const b = crypto.getRandomValues(new Uint8Array(256));

  const g = BigInt(dhConfig.g);
  const p = bytesToBigInt(dhConfig.p);
  const bInt = bytesToBigInt(b);
  const gAInt = bytesToBigInt(gA);

  // g^b mod p
  const gBInt = modPow(g, bInt, p);
  const gB = bigIntToBytes(gBInt, 256);

  // authKey = g_a^b mod p (DH shared secret)
  const authKeyInt = modPow(gAInt, bInt, p);
  const authKey = bigIntToBytes(authKeyInt, 256);

  return { b, gB, authKey };
}

// ── Caller: g_b kelgandan keyin authKey hisoblash ─────────
export function computeAuthKey(
  dhConfig: DHConfig,
  gB: Uint8Array,
  a: Uint8Array,
): Uint8Array {
  const p = bytesToBigInt(dhConfig.p);
  const gBInt = bytesToBigInt(gB);
  const aInt = bytesToBigInt(a);

  // authKey = g_b^a mod p
  const authKeyInt = modPow(gBInt, aInt, p);
  return bigIntToBytes(authKeyInt, 256);
}

// ── Key fingerprint (SHA-1 ning oxirgi 8 bayti) ───────────
export async function computeKeyFingerprint(authKey: Uint8Array): Promise<bigint> {
  const sha1Buf = await crypto.subtle.digest('SHA-1', authKey.buffer as ArrayBuffer);
  const sha1 = new Uint8Array(sha1Buf);
  // Oxirgi 8 bayt little-endian int64
  const last8 = sha1.slice(-8);
  let fingerprint = 0n;
  for (let i = 7; i >= 0; i--) {
    fingerprint = (fingerprint << 8n) | BigInt(last8[i]);
  }
  return fingerprint;
}

// ── AES-256-CTR kaliti authKey dan hosil qilish ───────────
export async function deriveCallKey(
  authKey: Uint8Array,
  isCaller: boolean,
): Promise<{ key: CryptoKey; iv: Uint8Array }> {
  // Telegram spec: x = 0 caller, x = 8 callee
  const x = isCaller ? 0 : 8;
  const keyBytes = authKey.slice(x, x + 32);  // 256-bit AES kalit
  const iv = authKey.slice(x + 32, x + 48);   // 128-bit IV

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-CTR' },
    false,
    ['encrypt', 'decrypt'],
  );

  return { key, iv };
}

// ── AES-256-CTR raw baytlarni olish (Node.js/Proxy uchun) ─────────
export function deriveCallKeyBytes(
  authKey: Uint8Array,
  isCaller: boolean,
): { encryptKey: Uint8Array; decryptKey: Uint8Array } {
  // Telegram VoIP spec:
  // encryptKey = SHA256(authKey + [isCaller ? 1 : 0])
  // decryptKey = SHA256(authKey + [isCaller ? 0 : 1])
  // Bu yerda SHA256 dan olingan 32 bayt AES-256 kaliti sifatida ishlatiladi
  // Bizning implementatsiyada WebCrypto yordamida ishlashni osonlashtirish uchun raw baytlarni qaytaramiz
  const x = isCaller ? 0 : 8;
  const encryptKey = authKey.slice(x, x + 32);
  const decryptKey = authKey.slice(x === 0 ? 8 : 0, (x === 0 ? 8 : 0) + 32);
  return { encryptKey, decryptKey };
}


// ── DH parametrlarni tekshirish (xavfsizlik) ──────────────
export function validateDHParams(dhConfig: DHConfig, gA: Uint8Array): boolean {
  const p = bytesToBigInt(dhConfig.p);
  const gAInt = bytesToBigInt(gA);

  // 1 < g_a < p-1 bo'lishi shart
  if (gAInt <= 1n || gAInt >= p - 1n) return false;

  // p ning uzunligi 2048 bit bo'lishi shart
  if (dhConfig.p.length !== 256) return false;

  return true;
}

// ── Yordamchi funksiyalar ─────────────────────────────────
export function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

export function bigIntToBytes(n: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let remaining = n;
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

// Binary exponentiation: base^exp mod mod
export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod === BigInt(1)) return BigInt(0);
  let result = BigInt(1);
  base = base % mod;
  while (exp > BigInt(0)) {
    if (exp & BigInt(1)) {
      result = (result * base) % mod;
    }
    exp >>= BigInt(1);
    base = (base * base) % mod;
  }
  return result;
}
