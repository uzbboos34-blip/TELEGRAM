'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { verifyPhoneCode, verifyPassword } from '@/lib/telegram/auth';

export default function VerifyPage() {
  const router = useRouter();
  const [code, setCode] = useState(['', '', '', '', '']);
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState('');
  const [resendTimer, setResendTimer] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const p = sessionStorage.getItem('tg_phone') || '';
    setPhone(p);
    inputRefs.current[0]?.focus();

    const interval = setInterval(() => {
      setResendTimer((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  function handleCodeChange(idx: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1);
    const newCode = [...code];
    newCode[idx] = digit;
    setCode(newCode);

    if (digit && idx < 4) {
      inputRefs.current[idx + 1]?.focus();
    }

    // Auto-submit
    if (newCode.every((d) => d) && newCode.join('').length === 5) {
      handleSubmitCode(newCode.join(''));
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !code[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 5);
    const newCode = text.split('').concat(['', '', '', '', '']).slice(0, 5);
    setCode(newCode);
    const nextEmpty = newCode.findIndex((d) => !d);
    inputRefs.current[nextEmpty === -1 ? 4 : nextEmpty]?.focus();
    if (text.length === 5) handleSubmitCode(text);
  }

  async function handleSubmitCode(codeStr?: string) {
    const finalCode = codeStr || code.join('');
    if (finalCode.length < 5) {
      setError('5 raqamli kodni to\'liq kiriting');
      return;
    }

    setError('');
    setLoading(true);
    const hash = sessionStorage.getItem('tg_phone_hash') || '';

    try {
      const result = await verifyPhoneCode(phone, finalCode, hash);
      if (result.success) {
        router.replace('/chats');
      } else if (result.requiresPassword) {
        setNeedsPassword(true);
        setLoading(false);
      } else {
        setError(result.error || 'Noto\'g\'ri kod');
        setCode(['', '', '', '', '']);
        inputRefs.current[0]?.focus();
        setLoading(false);
      }
    } catch (err) {
      setError('Tasdiqlashda xato yuz berdi');
      setLoading(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) {
      setError('Parol kiriting');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const result = await verifyPassword(password);
      if (result.success) {
        router.replace('/chats');
      } else {
        setError(result.error || 'Noto\'g\'ri parol');
        setLoading(false);
      }
    } catch (err) {
      setError('Parol tekshirishda xato');
      setLoading(false);
    }
  }

  const maskedPhone = phone
    ? phone.slice(0, -4).replace(/./g, '*') + phone.slice(-4)
    : '';

  return (
    <div className="login-page">
      <div className="login-card slide-up">
        {/* Back */}
        <div style={{ alignSelf: 'flex-start' }}>
          <button
            onClick={() => router.push('/login')}
            className="icon-btn"
            style={{ marginLeft: '-8px' }}
          >
            <ArrowLeft />
          </button>
        </div>

        {/* Header */}
        <div className="login-logo">
          <div style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #2AABEE, #229ED9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <MessageIcon />
          </div>
          <h1>{needsPassword ? 'Parol' : 'SMS Kodi'}</h1>
          <p>
            {needsPassword
              ? 'Ikki bosqichli tasdiqlash parolini kiriting'
              : <>
                  <strong style={{ color: 'var(--text-primary)' }}>{phone}</strong>
                  <br />raqamiga {code.length} raqamli kod yuborildi
                </>
            }
          </p>
        </div>

        {needsPassword ? (
          /* Password Form */
          <form className="login-form" onSubmit={handlePasswordSubmit}>
            <div className="field-group">
              <label className="field-label">2FA Parol</label>
              <input
                type="password"
                className="field-input"
                placeholder="Parolni kiriting"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>

            {error && (
              <div style={{
                padding: '12px 16px',
                background: 'rgba(229, 57, 53, 0.1)',
                border: '1px solid rgba(229, 57, 53, 0.3)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--error)',
                fontSize: 'var(--font-size-sm)',
              }}>
                ⚠️ {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Tekshirilmoqda...</> : 'Kirish'}
            </button>
          </form>
        ) : (
          /* OTP Form */
          <div className="login-form">
            <div className="otp-container" onPaste={handlePaste}>
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  className="otp-input"
                  type="tel"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleCodeChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  disabled={loading}
                />
              ))}
            </div>

            {error && (
              <div style={{
                padding: '12px 16px',
                background: 'rgba(229, 57, 53, 0.1)',
                border: '1px solid rgba(229, 57, 53, 0.3)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--error)',
                fontSize: 'var(--font-size-sm)',
              }}>
                ⚠️ {error}
              </div>
            )}

            <button
              className="btn btn-primary"
              disabled={loading || code.some((d) => !d)}
              onClick={() => handleSubmitCode()}
            >
              {loading
                ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Tekshirilmoqda...</>
                : 'Tasdiqlash'
              }
            </button>

            <button
              className="btn btn-ghost"
              disabled={resendTimer > 0}
              onClick={() => {
                router.push('/login');
              }}
              style={{ opacity: resendTimer > 0 ? 0.5 : 1 }}
            >
              {resendTimer > 0
                ? `Qayta yuborish (${resendTimer}s)`
                : 'Kodni qayta yuborish'
              }
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ArrowLeft() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
