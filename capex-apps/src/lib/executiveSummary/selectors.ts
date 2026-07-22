import type { ExecutiveSummaryStats, ExecutiveSummaryStatusLists } from '@/lib/executiveSummary/types';

export function buildFiltersKey(filters: {
  archetypeId: string | null;
  capexType: string;
  status: string;
  huCodes: readonly string[];
}): string {
  return JSON.stringify({
    a: filters.archetypeId ?? '',
    c: filters.capexType,
    s: filters.status,
    h: [...filters.huCodes].sort(),
  });
}

export function buildStatusListsFromStats(stats: ExecutiveSummaryStats | undefined): ExecutiveSummaryStatusLists {
  if (!stats) {
    return { offTrack: [], notStarted: [], inProgress: [], completed: [] };
  }
  const label = (huCode: string, projectName: string) => `${projectName} - ${huCode}`;
  return {
    offTrack: stats.buckets.attention.items
      .filter((i) => i.status === 2)
      .map((i) => label(i.huCode, i.projectName)),
    notStarted: stats.buckets.preCon.items.map((i) => `${i.projectName} - ${i.assetCode}`),
    inProgress: stats.buckets.inCon.items.map((i) => label(i.huCode, i.projectName)),
    completed: stats.buckets.postCon.items.map((i) => label(i.huCode, i.projectName)),
  };
}

export function mapPeriodHeaderFromMeta(
  meta: { periodName: string; startDate: string; endDate: string; multiYearName: string } | null | undefined,
) {
  if (!meta) return null;
  return {
    periodName: meta.periodName,
    startDate: meta.startDate,
    endDate: meta.endDate,
    multiYearName: meta.multiYearName,
  };
}
