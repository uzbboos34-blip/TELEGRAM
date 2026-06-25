'use client';

export default function ChatsPage() {
  return (
    <div className="chat-empty fade-in">
      <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 'var(--font-size-lg)', fontWeight: '600', marginBottom: '8px' }}>
          Ross Messenger
        </p>
        <p>Suhbat boshlash uchun chap tarafdagi kontaktni tanlang</p>
      </div>
    </div>
  );
}
