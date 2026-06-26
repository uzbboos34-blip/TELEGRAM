/**
 * Peer Cache — dialog entitieslarini saqlash
 * Asosiy muammo: accessHash=0 bo'lganda Telegram PEER_ID_INVALID qaytaradi
 * Yechim: getDialogs() dan kelgan entity'larni keshga saqlash
 */

export interface PeerInfo {
  id: string;
  type: 'user' | 'group' | 'channel' | 'bot';
  inputEntity: unknown;  // gramjs InputPeer (accessHash bilan)
  name: string;
  isBot?: boolean;
  isOnline?: boolean;
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
