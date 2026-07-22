import type { BudgetPeriod } from '@/types';
import { isBackendConfigured } from '@/lib/backendApiClient';
import { writeCachedDashboardBundle } from '@/lib/dashboard/snapshotCache';
import {
  fetchDashboardSnapshotFromBackend,
  type DashboardSnapshot,
} from '@/services/dashboardSnapshotApi';

export type DashboardBundle = {
  serverSnapshot: DashboardSnapshot | null;
  budgetPeriod: BudgetPeriod | null;
  /** Plain object so TanStack Query persistence (JSON) keeps id → name entries; Map does not round-trip. */
  categoryNames: Record<string, string>;
  totalProjectsCount: number;
};

const emptyBundle = (categoryNames: Record<string, string> = {}): DashboardBundle => ({
  serverSnapshot: null,
  budgetPeriod: null,
  categoryNames,
  totalProjectsCount: 0,
});

export async function fetchDashboardBundle(
  periodName: string,
  userId: number,
): Promise<DashboardBundle> {
  if (!periodName.trim()) {
    return emptyBundle();
  }

  if (isBackendConfigured()) {
    const fromBe = await fetchDashboardSnapshotFromBackend(periodName, userId);
    if (fromBe) {
      const bundle: DashboardBundle = {
        serverSnapshot: fromBe,
        budgetPeriod: null,
        categoryNames: {},
        totalProjectsCount: fromBe.projectCount,
      };
      writeCachedDashboardBundle(periodName, userId, bundle);
      return bundle;
    }
  }

  return emptyBundle();
}
