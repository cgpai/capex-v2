import { readPageSnapshot, writePageSnapshot } from '@/lib/pageSnapshotCache';
import { DASHBOARD_SNAPSHOT_PREFIX } from './constants';
import type { DashboardBundle } from '@/hooks/queries/fetchDashboardBundle';

const LOCAL_KEY_PREFIX = 'capex.dashboardBundle.v1:';

function localKey(periodName: string, userId: number): string {
  return `${LOCAL_KEY_PREFIX}${periodName.trim()}:${userId}`;
}

export function dashboardSnapshotKey(periodName: string, userId: number): string {
  return `${DASHBOARD_SNAPSHOT_PREFIX}:${periodName.trim()}:${userId}`;
}

function readLocalBundle(periodName: string, userId: number): DashboardBundle | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(localKey(periodName, userId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as DashboardBundle;
    if (!parsed?.serverSnapshot) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function writeLocalBundle(periodName: string, userId: number, bundle: DashboardBundle): void {
  if (typeof window === 'undefined' || !bundle.serverSnapshot) return;
  try {
    window.localStorage.setItem(
      localKey(periodName, userId),
      JSON.stringify({
        serverSnapshot: bundle.serverSnapshot,
        budgetPeriod: null,
        categoryNames: {},
        totalProjectsCount: bundle.totalProjectsCount,
      }),
    );
  } catch {
    /* quota */
  }
}

/** Session + localStorage — tampil instan saat buka ulang tab / refresh. */
export function readCachedDashboardBundle(
  periodName: string,
  userId: number,
): DashboardBundle | undefined {
  const fromSession = readPageSnapshot<DashboardBundle>(dashboardSnapshotKey(periodName, userId));
  if (fromSession?.serverSnapshot) return fromSession;
  return readLocalBundle(periodName, userId);
}

export function writeCachedDashboardBundle(
  periodName: string,
  userId: number,
  bundle: DashboardBundle,
): void {
  if (!bundle.serverSnapshot) return;
  const payload: DashboardBundle = {
    serverSnapshot: bundle.serverSnapshot,
    budgetPeriod: null,
    categoryNames: {},
    totalProjectsCount: bundle.totalProjectsCount,
  };
  writePageSnapshot(dashboardSnapshotKey(periodName, userId), payload);
  writeLocalBundle(periodName, userId, payload);
}
