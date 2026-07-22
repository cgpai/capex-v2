import type {
  ExecutiveSummaryPageMeta,
  ExecutiveSummaryProjectsPage,
  ExecutiveSummaryProjectsQueryParams,
  ExecutiveSummaryStats,
} from '../lib/executiveSummary/types';
import type { ExecutiveDashboardMetrics } from '../lib/executiveSummary/dashboardTypes';
import { normalizeExecutiveDashboardMetrics } from '../lib/executiveSummary/normalizeDashboardMetrics';
import { postBackend } from '../lib/backendApiClient';

export async function fetchExecutiveSummaryPageMetaFromBackend(
  periodName: string,
  userId: number,
): Promise<ExecutiveSummaryPageMeta | null> {
  if (!periodName.trim()) return null;
  const data = await postBackend<Partial<ExecutiveSummaryPageMeta>>(
    '/executive-summary/page-bundle',
    { periodName: periodName.trim(), userId },
    { source: 'executiveSummary.pageMeta' },
  );
  if (!data) return null;
  return {
    periodName: data.periodName ?? periodName,
    periodMeta: data.periodMeta ?? null,
    hospitalUnits: Array.isArray(data.hospitalUnits) ? data.hospitalUnits : [],
    archetypes: Array.isArray(data.archetypes) ? data.archetypes : [],
  };
}

export async function fetchExecutiveSummaryStatsFromBackend(
  periodName: string,
  userId: number,
  filters: Omit<ExecutiveSummaryProjectsQueryParams, 'page' | 'pageSize' | 'sortBy' | 'sortDir'>,
): Promise<ExecutiveSummaryStats | null> {
  if (!periodName.trim()) return null;
  return postBackend<ExecutiveSummaryStats>(
    '/executive-summary/summary-stats',
    {
      periodName: periodName.trim(),
      userId,
      search: filters.search,
      archetypeId: filters.archetypeId ?? undefined,
      capexType: filters.capexType,
      status: filters.status,
      huCodes: [...filters.huCodes],
    },
    { source: 'executiveSummary.stats' },
  );
}

export async function fetchExecutiveSummaryProjectsPageFromBackend(
  params: ExecutiveSummaryProjectsQueryParams,
): Promise<ExecutiveSummaryProjectsPage | null> {
  if (!params.periodName.trim()) return null;
  return postBackend<ExecutiveSummaryProjectsPage>(
    '/executive-summary/projects-page',
    {
      periodName: params.periodName.trim(),
      userId: params.userId,
      page: params.page,
      pageSize: params.pageSize,
      search: params.search,
      sortBy: params.sortBy,
      sortDir: params.sortDir,
      archetypeId: params.archetypeId ?? undefined,
      capexType: params.capexType,
      status: params.status,
      huCodes: [...params.huCodes],
    },
    { source: 'executiveSummary.projectsPage' },
  );
}

export async function fetchExecutiveDashboardMetricsFromBackend(
  periodName: string,
  userId: number,
  filters: {
    archetypeId?: string | null;
    capexType?: string;
    status?: string;
    huCodes?: string[];
  },
): Promise<ExecutiveDashboardMetrics | null> {
  if (!periodName.trim()) return null;
  const data = await postBackend<Partial<ExecutiveDashboardMetrics>>(
    '/executive-summary/dashboard-metrics',
    {
      periodName: periodName.trim(),
      userId,
      archetypeId: filters.archetypeId ?? undefined,
      capexType: filters.capexType ?? 'all',
      status: filters.status ?? 'all',
      huCodes: filters.huCodes ?? [],
    },
    { source: 'executiveSummary.dashboardMetrics', timeoutMs: 120_000 },
  );
  return data ? normalizeExecutiveDashboardMetrics(data) : null;
}
