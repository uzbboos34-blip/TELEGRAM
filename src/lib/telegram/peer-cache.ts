/**
 * Peer Cache — dialog entities, online status va so'nggi ko'rish vaqti
 */

export interface PeerInfo {
  id: string;
  type: 'user' | 'group' | 'channel' | 'bot';
  inputEntity: unknown;
  name: string;
  isBot?: boolean;
  isOnline?: boolean;
  statusText?: string;   // "online", "yaqinda ko'rilgan", "Bugun 14:30" ...
  memberCount?: number;  // Guruh/kanal uchun a'zolar soni
}

const _cache = new Map<string, PeerInfo>();

export function cachePeer(id: string, info: PeerInfo) {
  _cache.set(id, info);
}

export function getCachedPeer(id: string): PeerInfo | undefined {
  return _cache.get(id);
}

export function getCachedEntity(id: string): unknown {
  return _cache.get(id)?.inputEntity;
}

export function clearPeerCache() {
  _cache.clear();
}

// ── Status parser ─────────────────────────────────────────
export function parseUserStatus(status: any): { isOnline: boolean; text: string } {
  if (!status) return { isOnline: false, text: '' };

  // gramjs turli versiyalarda className yoki constructor.name ishlatadi
  const cls: string =
    status.className ||
    status.constructor?.name ||
    status._ || // TDLib style
    '';

  switch (cls) {
    case 'UserStatusOnline':
      return { isOnline: true, text: 'online' };

    case 'UserStatusOffline': {
      const wasOnline = status.wasOnline;
      if (!wasOnline) return { isOnline: false, text: "oxirgi marta ko'rilgan" };
      const d = new Date(wasOnline * 1000);
      const diffMs = Date.now() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHr  = Math.floor(diffMs / 3600000);
      const diffDay = Math.floor(diffMs / 86400000);
      if (diffMin < 1)  return { isOnline: false, text: 'az oldin' };
      if (diffMin < 60) return { isOnline: false, text: `${diffMin} daqiqa oldin` };
      if (diffHr  < 24) return { isOnline: false, text: `Bugun ${d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}` };
      if (diffDay === 1) return { isOnline: false, text: `Kecha ${d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}` };
      if (diffDay  < 7) return { isOnline: false, text: d.toLocaleDateString('ru', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) };
      return { isOnline: false, text: d.toLocaleDateString('ru', { day: 'numeric', month: 'short' }) };
    }

    case 'UserStatusRecently':
      return { isOnline: false, text: "yaqinda ko'rilgan" };

    case 'UserStatusLastWeek':
      return { isOnline: false, text: 'bu hafta ko\'rilgan' };

    case 'UserStatusLastMonth':
      return { isOnline: false, text: 'bu oy ko\'rilgan' };

    case 'UserStatusEmpty':
    default:
      return { isOnline: false, text: '' };
  }
}
