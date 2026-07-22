import { LS_TAB_LOGOUT_SIGNAL, LS_SESSION_REFRESHED_AT, TAB_SESSION_CHANNEL } from './tabSessionKeys';

export type TabSessionMessage =
  | { type: 'FORCE_LOGOUT'; at: number }
  | { type: 'SESSION_REFRESHED'; at: number }
  | { type: 'TAB_VISIBLE' }
  | { type: 'TAB_HIDDEN' };

type ForceLogoutListener = () => void;
type SessionRefreshedListener = (at: number) => void;

let channel: BroadcastChannel | null = null;
const logoutListeners = new Set<ForceLogoutListener>();
const refreshListeners = new Set<SessionRefreshedListener>();

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }
  if (!channel) {
    channel = new BroadcastChannel(TAB_SESSION_CHANNEL);
    channel.onmessage = (event: MessageEvent<TabSessionMessage>) => {
      const msg = event.data;
      if (!msg) return;
      if (msg.type === 'FORCE_LOGOUT') {
        logoutListeners.forEach((fn) => fn());
      } else if (msg.type === 'SESSION_REFRESHED') {
        refreshListeners.forEach((fn) => fn(msg.at));
      }
    };
  }
  return channel;
}

/** Notify other tabs to run the same logout flow (storage + BroadcastChannel). */
export function broadcastForceLogout(): void {
  const at = Date.now();
  try {
    localStorage.setItem(LS_TAB_LOGOUT_SIGNAL, String(at));
    localStorage.removeItem(LS_TAB_LOGOUT_SIGNAL);
  } catch {
    /* private mode / quota */
  }
  getChannel()?.postMessage({ type: 'FORCE_LOGOUT', at } satisfies TabSessionMessage);
}

/** Notify other tabs that tokens were refreshed — avoids duplicate refresh requests. */
export function broadcastSessionRefreshed(): void {
  const at = Date.now();
  try {
    localStorage.setItem(LS_SESSION_REFRESHED_AT, String(at));
  } catch {
    /* private mode */
  }
  getChannel()?.postMessage({ type: 'SESSION_REFRESHED', at } satisfies TabSessionMessage);
}

export function subscribeSessionRefreshed(listener: SessionRefreshedListener): () => void {
  refreshListeners.add(listener);
  getChannel();

  const onStorage = (event: StorageEvent) => {
    if (event.key === LS_SESSION_REFRESHED_AT && event.newValue != null) {
      const at = Number(event.newValue);
      if (Number.isFinite(at)) listener(at);
    }
  };

  window.addEventListener('storage', onStorage);
  return () => {
    refreshListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function subscribeForceLogout(listener: ForceLogoutListener): () => void {
  logoutListeners.add(listener);
  getChannel();

  const onStorage = (event: StorageEvent) => {
    if (event.key === LS_TAB_LOGOUT_SIGNAL && event.newValue != null) {
      listener();
    }
  };

  window.addEventListener('storage', onStorage);
  return () => {
    logoutListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function closeTabSessionChannel(): void {
  channel?.close();
  channel = null;
  logoutListeners.clear();
  refreshListeners.clear();
}
