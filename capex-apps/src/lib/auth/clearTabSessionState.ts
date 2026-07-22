import { LS_TAB_HIDDEN_SINCE, LS_SESSION_REFRESHED_AT, LS_SESSION_AUTH_SINCE } from './tabSessionKeys';

const LS_REFRESH_LOCK = 'capex.auth.refreshLock';

/** Reset tab-idle / refresh-lock keys after a successful login. */
export function clearTabSessionState(): void {
  try {
    localStorage.removeItem(LS_TAB_HIDDEN_SINCE);
    localStorage.removeItem(LS_REFRESH_LOCK);
    localStorage.removeItem(LS_SESSION_REFRESHED_AT);
    localStorage.setItem(LS_SESSION_AUTH_SINCE, String(Date.now()));
  } catch {
    /* private mode */
  }
}

export function readSessionAuthSince(): number {
  try {
    const raw = localStorage.getItem(LS_SESSION_AUTH_SINCE);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}
