/**
 * Telegram Authentication — Dynamic imports
 */

import { getTelegramClient, saveSession, clearSession, getSessionString } from './client';

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
}

let _phoneCodeHash = '';

export async function sendPhoneCode(phoneNumber: string): Promise<AuthResult> {
  try {
    const client = await getTelegramClient();
    const { Api } = await import('telegram');

    const APP_ID = parseInt(process.env.NEXT_PUBLIC_TG_APP_ID || '13292460');
    const APP_HASH = process.env.NEXT_PUBLIC_TG_APP_HASH || '5e211ffc78bd127ad0d784b502e7ce36';

    const result = await client.invoke(
      new Api.auth.SendCode({
        phoneNumber: phoneNumber.replace(/\s/g, ''),
        apiId: APP_ID,
        apiHash: APP_HASH,
        settings: new Api.CodeSettings({
          allowFlashcall: false,
          currentNumber: false,
          allowAppHash: true,
          allowMissedCall: false,
          allowFirebase: false,
        }),
      })
    );

    _phoneCodeHash = (result as InstanceType<typeof Api.auth.SentCode>).phoneCodeHash;
    return { success: true, phoneCodeHash: _phoneCodeHash };
  } catch (error: unknown) {
    const err = error as Error & { errorMessage?: string };
    console.error('[Auth] sendPhoneCode error:', err);
    return { success: false, error: err.errorMessage || err.message || 'Kod yuborishda xato' };
  }
}

export async function verifyPhoneCode(
  phoneNumber: string,
  code: string,
  storedHash?: string
): Promise<AuthResult & { user?: UserInfo }> {
  try {
    const client = await getTelegramClient();
    const { Api } = await import('telegram');

    const hash = storedHash || _phoneCodeHash;

    const result = await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: phoneNumber.replace(/\s/g, ''),
        phoneCodeHash: hash,
        phoneCode: code,
      })
    );

    if (result instanceof Api.auth.Authorization) {
      const user = result.user as InstanceType<typeof Api.User>;
      const session = await client.session.save() as string;
      saveSession(session);

      const userInfo: UserInfo = {
        id: user.id?.toString() || '',
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

    return { success: false, error: 'Tasdiqlashda xato' };
  } catch (error: unknown) {
    const err = error as Error & { errorMessage?: string };
    console.error('[Auth] verifyPhoneCode error:', err);

    if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
      return { success: false, requiresPassword: true, error: '2FA parol kerak' };
    }

    return { success: false, error: err.errorMessage || err.message || 'Kod xato' };
  }
}

export async function verifyPassword(password: string): Promise<AuthResult & { user?: UserInfo }> {
  try {
    const client = await getTelegramClient();
    const { Api } = await import('telegram');
    const { computeCheck } = await import('telegram/Password');

    const passwordInfo = await client.invoke(new Api.account.GetPassword());
    const passwordCheck = await computeCheck(passwordInfo as InstanceType<typeof Api.account.Password>, password);

    const result = await client.invoke(new Api.auth.CheckPassword({ password: passwordCheck }));

    if (result instanceof Api.auth.Authorization) {
      const user = result.user as InstanceType<typeof Api.User>;
      const session = await client.session.save() as string;
      saveSession(session);

      const userInfo: UserInfo = {
        id: user.id?.toString() || '',
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
    return { success: false, error: err.errorMessage || err.message || 'Parol xato' };
  }
}

export async function logout(): Promise<void> {
  try {
    const client = await getTelegramClient();
    const { Api } = await import('telegram');
    await client.invoke(new Api.auth.LogOut());
  } catch (e) {
    console.error('[Auth] logout:', e);
  } finally {
    clearSession();
  }
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  const session = localStorage.getItem('tg_session');
  return !!session && session.length > 10;
}

export function getCurrentUser(): UserInfo | null {
  if (typeof window === 'undefined') return null;
  try {
    const user = localStorage.getItem('tg_user');
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
}
