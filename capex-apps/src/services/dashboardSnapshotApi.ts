import { isBackendConfigured, postBackend } from '../lib/backendApiClient';

export type DashboardSnapshot = {
  totalBudget: number;
  totalConsumed: number;
  projectCount: number;
  projectStatusData: { name: string; value: number; color: string }[];
  budgetByCategory: { id?: string; name: string; approved: number; consumed: number }[];
  sankeyData: { source: string; target: string; value: number }[];
};

/**
 * Single BFF request: dashboard aggregates without loading the full project/asset tree in the browser.
 */
export async function fetchDashboardSnapshotFromBackend(
  periodName: string,
  userId: number,
): Promise<DashboardSnapshot | null> {
  if (!isBackendConfigured() || !periodName.trim()) {
    return null;
  }

  return postBackend<DashboardSnapshot>(
    '/dashboard/snapshot',
    { periodName: periodName.trim(), userId },
    { source: 'dashboard.snapshot', timeoutMs: 30_000 },
  );
}
