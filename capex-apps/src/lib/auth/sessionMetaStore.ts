import type { AuthMeResponse } from './authApi';

let sessionMeta: AuthMeResponse['session'] | null = null;
const listeners = new Set<(meta: AuthMeResponse['session'] | null) => void>();

export function updateSessionMeta(meta: AuthMeResponse['session'] | null | undefined): void {
  sessionMeta = meta ?? null;
  listeners.forEach((fn) => fn(sessionMeta));
}

export function getSessionMeta(): AuthMeResponse['session'] | null {
  return sessionMeta;
}

export function subscribeSessionMeta(
  fn: (meta: AuthMeResponse['session'] | null) => void,
): () => void {
  listeners.add(fn);
  fn(sessionMeta);
  return () => listeners.delete(fn);
}

export function clearSessionMeta(): void {
  updateSessionMeta(null);
}
