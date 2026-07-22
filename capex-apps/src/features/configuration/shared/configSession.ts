export function getCurrentAppUserIdFromSession(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem('currentUserId');
  const uid = Number(raw);
  return Number.isFinite(uid) ? uid : null;
}
