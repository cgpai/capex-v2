import { refreshBackendSession } from './authApi';
import { authDebug } from './authDebug';
import { broadcastSessionRefreshed } from './tabSessionBroadcast';
import { LS_SESSION_REFRESHED_AT } from './tabSessionKeys';

const LS_REFRESH_LOCK = 'capex.auth.refreshLock';
const LOCK_STALE_MS = 30_000;

type RefreshResult = { ok: boolean };

let inMemoryRefresh: Promise<RefreshResult> | null = null;

function now(): number {
  return Date.now();
}

function readLock(): { owner: string; at: number } | null {
  try {
    const raw = localStorage.getItem(LS_REFRESH_LOCK);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { owner?: string; at?: number };
    if (!parsed?.owner || !parsed?.at) return null;
    return { owner: parsed.owner, at: parsed.at };
  } catch {
    return null;
  }
}

function writeLock(owner: string): void {
  try {
    localStorage.setItem(LS_REFRESH_LOCK, JSON.stringify({ owner, at: now() }));
  } catch {
    /* private mode */
  }
}

function clearLock(owner: string): void {
  try {
    const current = readLock();
    if (current?.owner === owner) {
      localStorage.removeItem(LS_REFRESH_LOCK);
    }
  } catch {
    /* noop */
  }
}

function randomOwner(): string {
  return `${now()}-${Math.random().toString(36).slice(2)}`;
}

async function waitForPeerRefresh(maxMs: number): Promise<boolean> {
  const deadline = now() + maxMs;
  while (now() < deadline) {
    const lock = readLock();
    if (!lock || now() - lock.at > LOCK_STALE_MS) {
      return false;
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return true;
}

function readPeerRefreshAt(): number | null {
  try {
    const raw = localStorage.getItem(LS_SESSION_REFRESHED_AT);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Single-flight refresh across tabs (localStorage lock + in-memory promise).
 * Prevents refresh-token rotation races that revoke the whole session family.
 */
export async function coordinatedRefreshSession(): Promise<boolean> {
  if (inMemoryRefresh) {
    authDebug('refresh: join in-memory flight');
    return (await inMemoryRefresh).ok;
  }

  const owner = randomOwner();
  const existing = readLock();
  if (existing && now() - existing.at < LOCK_STALE_MS) {
    authDebug('refresh: waiting for peer tab', { owner: existing.owner });
    await waitForPeerRefresh(LOCK_STALE_MS);
    const peerRefresh = readPeerRefreshAt();
    if (peerRefresh && now() - peerRefresh < LOCK_STALE_MS) {
      authDebug('refresh: peer refreshed recently — skip');
      return true;
    }
    const after = readLock();
    if (!after || now() - after.at > LOCK_STALE_MS) {
      authDebug('refresh: peer finished — verify with refresh');
      return refreshBackendSession();
    }
    authDebug('refresh: peer lock still held — skip (session likely fresh)');
    return true;
  }

  writeLock(owner);

  inMemoryRefresh = (async (): Promise<RefreshResult> => {
    try {
      authDebug('refresh: start');
      const ok = await refreshBackendSession();
      if (ok) {
        broadcastSessionRefreshed();
      }
      authDebug('refresh: done', { ok });
      return { ok };
    } catch (e) {
      authDebug('refresh: error', { error: String(e) });
      return { ok: false };
    } finally {
      clearLock(owner);
      inMemoryRefresh = null;
    }
  })();

  return (await inMemoryRefresh).ok;
}
