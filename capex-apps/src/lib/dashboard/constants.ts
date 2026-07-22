import type { DashboardStats } from './types';

export const DASHBOARD_STALE_TIME_MS = 60_000;
export const DASHBOARD_GC_TIME_MS = 1000 * 60 * 60 * 24;
export const DASHBOARD_SNAPSHOT_PREFIX = 'dashboard';

export const EMPTY_DASHBOARD_STATS: DashboardStats = {
  totalBudget: 0,
  totalConsumed: 0,
  projectCount: 0,
  projectStatusData: [
    { name: 'On Track', value: 0, color: '#28A745' },
    { name: 'At Risk', value: 0, color: '#FFC107' },
    { name: 'Off Track', value: 0, color: '#DC3545' },
  ],
  budgetByCategory: [],
  sankeyData: [],
};
