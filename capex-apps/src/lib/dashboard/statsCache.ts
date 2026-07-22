import type { DashboardStats } from './types';

const STORAGE_KEY = 'capex.dashboardStats.v1';

type CachedEntry = {
  periodName: string;
  userId: number;
  stats: DashboardStats;
  savedAt: number;
};

export function readCachedDashboardStats(
  periodName: string,
  userId: number,
): DashboardStats | null {
  if (typeof window === 'undefined') return null;
  const period = periodName.trim();
  if (!period || !Number.isFinite(userId)) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return null;
    const hit = (list as CachedEntry[]).find(
      (e) => e.periodName === period && e.userId === userId && e.stats,
    );
    return hit?.stats ?? null;
  } catch {
    return null;
  }
}

export function writeCachedDashboardStats(
  periodName: string,
  userId: number,
  stats: DashboardStats,
): void {
  if (typeof window === 'undefined') return;
  const period = periodName.trim();
  if (!period || !Number.isFinite(userId)) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list: CachedEntry[] = Array.isArray(raw ? JSON.parse(raw) : null)
      ? (JSON.parse(raw!) as CachedEntry[])
      : [];
    const next: CachedEntry = {
      periodName: period,
      userId,
      stats,
      savedAt: Date.now(),
    };
    const filtered = list.filter((e) => !(e.periodName === period && e.userId === userId));
    filtered.unshift(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, 8)));
  } catch {
    /* quota */
  }
}
