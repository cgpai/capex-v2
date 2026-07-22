import {
  buildDashboardStatsFromLegacy,
  dashboardStatsFromSnapshot,
} from './buildDashboardStatsFromLegacy';
import type { DashboardBundle } from '@/hooks/queries/fetchDashboardBundle';
import type { DashboardStats } from './types';

export function resolveDashboardStatsFromBundle(bundle: DashboardBundle | undefined): DashboardStats | null {
  if (!bundle) return null;
  if (bundle.serverSnapshot) return dashboardStatsFromSnapshot(bundle.serverSnapshot);
  if (bundle.budgetPeriod) {
    return buildDashboardStatsFromLegacy(bundle.budgetPeriod, bundle.categoryNames);
  }
  return null;
}
