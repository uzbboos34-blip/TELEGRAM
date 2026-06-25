'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendPhoneCode } from '@/lib/telegram/auth';

const COUNTRY_CODES = [
  { code: '+7', name: 'Россия', flag: '🇷🇺' },
  { code: '+998', name: 'O\'zbekiston', flag: '🇺🇿' },
  { code: '+7', name: 'Qozog\'iston', flag: '🇰🇿' },
  { code: '+375', name: 'Belarus', flag: '🇧🇾' },
  { code: '+380', name: 'Ukraina', flag: '🇺🇦' },
  { code: '+1', name: 'USA', flag: '🇺🇸' },
];

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+7');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCountries, setShowCountries] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) {
      setError('Telefon raqamni kiriting');
      return;
    }
    setError('');
    setLoading(true);

    const fullPhone = countryCode + phone.replace(/\D/g, '');
    try {
      const result = await sendPhoneCode(fullPhone);
      if (result.success) {
        sessionStorage.setItem('tg_phone', fullPhone);
        sessionStorage.setItem('tg_phone_hash', result.phoneCodeHash || '');
        router.push('/verify');
      } else {
        setError(result.error || 'Xato yuz berdi');
      }
    } catch (err) {
      setError('Ulanishda xato. Internet aloqasini tekshiring.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card slide-up">
        {/* Logo */}
        <div className="login-logo">
          <TelegramLogo />
          <h1>Ross Messenger</h1>
          <p>Telefon raqamingizni kiriting.<br />Biz sizga tasdiqlash kodi yuboramiz.</p>
        </div>

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit}>
          {/* Country Picker */}
          <div className="field-group">
            <label className="field-label">Davlat kodi</label>
            <div className="relative">
              <button
                type="button"
                className="field-input"
                style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                onClick={() => setShowCountries(!showCountries)}
              >
                <span>{COUNTRY_CODES.find(c => c.code === countryCode)?.flag}</span>
                <span style={{ flex: 1 }}>{COUNTRY_CODES.find(c => c.code === countryCode)?.name}</span>
                <span style={{ color: 'var(--accent)', fontWeight: '600' }}>{countryCode}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {showCountries && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 10,
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-lg)',
                  marginTop: '4px',
                  overflow: 'hidden',
                }}>
                  {COUNTRY_CODES.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { setCountryCode(c.code); setShowCountries(false); }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px 16px',
                        background: countryCode === c.code ? 'var(--bg-selected)' : 'none',
                        border: 'none',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 'var(--font-size-sm)',
                        transition: 'background 0.1s',
                      }}
                    >
                      <span style={{ fontSize: '20px' }}>{c.flag}</span>
                      <span style={{ flex: 1, textAlign: 'left' }}>{c.name}</span>
                      <span style={{ color: 'var(--accent)', fontWeight: '600' }}>{c.code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Phone */}
          <div className="field-group">
            <label className="field-label">Telefon raqam</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{
                padding: '14px 16px',
                background: 'var(--bg-input)',
                border: '1.5px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--accent)',
                fontWeight: '600',
                flexShrink: 0,
                fontSize: 'var(--font-size-md)',
              }}>
                {countryCode}
              </div>
              <input
                className="field-input"
                type="tel"
                placeholder="912 345 67 89"
                value={phone}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^\d\s-]/g, '');
                  setPhone(val);
                }}
                inputMode="tel"
                autoComplete="tel-national"
                autoFocus
                style={{ flex: 1 }}
              />
            </div>
          </div>

          {/* Error */}
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
            type="submit"
            className="btn btn-primary"
            disabled={loading || !phone.trim()}
          >
            {loading ? (
              <>
                <div className="spinner" style={{ width: '18px', height: '18px', borderWidth: '2px' }} />
                Yuborilmoqda...
              </>
            ) : (
              'Keyingi →'
            )}
          </button>
        </form>

        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', textAlign: 'center' }}>
          Kirib, siz{' '}
          <a href="#" style={{ color: 'var(--accent)' }}>Foydalanish Shartlariga</a>
          {' '}rozilik bildirasiz
        </p>
      </div>
    </div>
  );
}

function TelegramLogo() {
  return (
    <svg width="80" height="80" viewBox="0 0 240 240" fill="none">
      <circle cx="120" cy="120" r="120" fill="url(#lg1)" />
      <path d="M81.229 128.772l14.237 39.406s1.78 3.687 3.686 3.687c1.907 0 30.255-29.492 30.255-29.492l31.525-60.89L81.229 128.772z" fill="#C8DAEA" />
      <path d="M100.106 138.878l-2.733 29.046s-1.144 8.9 7.754 0 17.415-15.763 17.415-15.763" fill="#A9C9DD" />
      <path d="M81.486 130.178l-40.32-13.195s-4.83-1.956-3.284-6.396c.32-.915 1.985-1.742 5.513-3.922 16.964-10.454 139.151-52.555 139.151-52.555s4.441-1.49 7.07-.501c1.284.495 2.11 1.504 2.362 3.405.231 1.695.345 3.272.034 5.546-.025.179-35.442 104.637-35.442 104.637s-2.059 5.106-7.471 5.296c-2.016.069-4.471-.416-7.452-2.876-7.544-6.254-33.829-24.171-39.624-28.126a1.043 1.043 0 0 1-.447-.797c-.073-.523.504-1.17.504-1.17s45.729-40.603 46.981-45.109c.094-.33-.261-.492-.739-.349-3.012.903-55.233 34.115-61.084 37.842a3.09 3.09 0 0 1-1.752.27z" fill="white" />
      <defs>
        <linearGradient id="lg1" x1="120" y1="0" x2="120" y2="240" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2AABEE" />
          <stop offset="1" stopColor="#229ED9" />
        </linearGradient>
      </defs>
    </svg>
  );
}
