/**
 * Telegram Authentication
 * Telefon raqam + OTP + 2FA
 */

import { TelegramClient } from 'telegram';
import { getTelegramClient, saveSession, clearSession } from './client';
import { Api } from 'telegram';

export interface AuthResult {
  success: boolean;
  phoneCodeHash?: string;
  error?: string;
  requiresPassword?: boolean;
}

export interface UserInfo {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  phone?: string;
  photo?: string;
}

let phoneCodeHash = '';

/**
 * Telefon raqamga OTP yuborish
 */
export async function sendPhoneCode(phoneNumber: string): Promise<AuthResult> {
  try {
    const client = await getTelegramClient();

    const result = await client.invoke(
      new Api.auth.SendCode({
        phoneNumber: phoneNumber.replace(/\s/g, ''),
        apiId: parseInt(process.env.NEXT_PUBLIC_TG_APP_ID || '13292460'),
        apiHash: process.env.NEXT_PUBLIC_TG_APP_HASH || '5e211ffc78bd127ad0d784b502e7ce36',
        settings: new Api.CodeSettings({
          allowFlashcall: false,
          currentNumber: false,
          allowAppHash: true,
          allowMissedCall: false,
          allowFirebase: false,
        }),
      })
    );

    phoneCodeHash = (result as Api.auth.SentCode).phoneCodeHash;

    return {
      success: true,
      phoneCodeHash: phoneCodeHash,
    };
  } catch (error: unknown) {
    const err = error as Error & { code?: number; errorMessage?: string };
    console.error('[Auth] sendPhoneCode error:', err);
    return {
      success: false,
      error: err.errorMessage || err.message || 'Kod yuborishda xato',
    };
  }
}

/**
 * OTP kodni tasdiqlash
 */
export async function verifyPhoneCode(
  phoneNumber: string,
  code: string,
  storedHash?: string
): Promise<AuthResult & { user?: UserInfo }> {
  try {
    const client = await getTelegramClient();
    const hash = storedHash || phoneCodeHash;

    const result = await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: phoneNumber.replace(/\s/g, ''),
        phoneCodeHash: hash,
        phoneCode: code,
      })
    );

    if (result instanceof Api.auth.Authorization) {
      const user = result.user as Api.User;
      const session = client.session.save() as unknown as string;
      saveSession(session);

      const userInfo: UserInfo = {
        id: user.id.toString(),
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || '',
        phone: user.phone || '',
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem('tg_user', JSON.stringify(userInfo));
      }

      return { success: true, user: userInfo };
    }

    if (result instanceof Api.auth.AuthorizationSignUpRequired) {
      return { success: false, error: 'Ro\'yxatdan o\'tish kerak' };
    }

    return { success: false, error: 'Tasdiqlashda xato' };
  } catch (error: unknown) {
    const err = error as Error & { code?: number; errorMessage?: string };
    console.error('[Auth] verifyPhoneCode error:', err);

    if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
      return { success: false, requiresPassword: true, error: '2FA parol kerak' };
    }

    return {
      success: false,
      error: err.errorMessage || err.message || 'Tasdiqlashda xato',
    };
  }
}

/**
 * 2FA parol bilan kirish
 */
export async function verifyPassword(password: string): Promise<AuthResult & { user?: UserInfo }> {
  try {
    const client = await getTelegramClient();

    const passwordInfo = await client.invoke(new Api.account.GetPassword());
    
    const { computeCheck } = await import('telegram/Password');
    const passwordCheck = await computeCheck(passwordInfo as Api.account.Password, password);

    const result = await client.invoke(new Api.auth.CheckPassword({ password: passwordCheck }));

    if (result instanceof Api.auth.Authorization) {
      const user = result.user as Api.User;
      const session = client.session.save() as unknown as string;
      saveSession(session);

      const userInfo: UserInfo = {
        id: user.id.toString(),
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || '',
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem('tg_user', JSON.stringify(userInfo));
      }

      return { success: true, user: userInfo };
    }

    return { success: false, error: 'Noto\'g\'ri parol' };
  } catch (error: unknown) {
    const err = error as Error & { errorMessage?: string };
    return {
      success: false,
      error: err.errorMessage || err.message || 'Parol xato',
    };
  }
}

/**
 * Chiqish
 */
export async function logout(): Promise<void> {
  try {
    const client = await getTelegramClient();
    await client.invoke(new Api.auth.LogOut());
  } catch (e) {
    console.error('[Auth] logout error:', e);
  } finally {
    clearSession();
  }
}

/**
 * Sessiya tekshirish
 */
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  const session = localStorage.getItem('tg_session');
  return !!session && session.length > 10;
}

export function getCurrentUser(): UserInfo | null {
  if (typeof window === 'undefined') return null;
  const user = localStorage.getItem('tg_user');
  return user ? JSON.parse(user) : null;
}
