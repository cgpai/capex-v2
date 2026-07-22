import type { ListSource } from './capexProjectListScope';
import { isCompleteListSource } from './capexProjectListScope';

/** In-memory client filter pools — survive screen navigation within the same tab. */
const poolsBySessionKey = new Map<string, ListSource>();

export function sessionClientPoolKey(userId: number, periodKey: string): string {
  return `${userId}\u0001${periodKey.trim()}`;
}

export function getSessionClientPool(userId: number, periodKey: string): ListSource | null {
  if (!userId || !periodKey.trim()) return null;
  const hit = poolsBySessionKey.get(sessionClientPoolKey(userId, periodKey));
  if (!hit || !isCompleteListSource(hit)) return null;
  return hit;
}

export function setSessionClientPool(userId: number, periodKey: string, source: ListSource): void {
  if (!userId || !periodKey.trim() || !isCompleteListSource(source)) return;
  poolsBySessionKey.set(sessionClientPoolKey(userId, periodKey), source);
}

export function clearSessionClientPoolsForUser(userId: number): void {
  const prefix = `${userId}\u0001`;
  for (const key of poolsBySessionKey.keys()) {
    if (key.startsWith(prefix)) poolsBySessionKey.delete(key);
  }
}

export function deleteSessionClientPool(userId: number, periodKey: string): void {
  if (!userId || !periodKey.trim()) return;
  poolsBySessionKey.delete(sessionClientPoolKey(userId, periodKey));
}
