import type { ProjectListBundle } from '@/services/capexProjectListApi';
import { fetchProjectListBundleMerged } from '@/services/capexProjectListApi';
import { withRequestCache } from '@/lib/requestCache';

export type { ProjectListBundle };

const TABLE_TTL_MS = 5 * 60 * 1000;

function requestCacheKey(periodName: string, userId: number, skipCache?: boolean) {
  const pn = periodName.trim().toLowerCase();
  return skipCache
    ? `capex-project-list:${userId}:${pn}:skip`
    : `capex-project-list:${userId}:${pn}`;
}

export async function fetchCapexProjectListPageData(
  periodName: string,
  userId: number,
  accessToken?: string | null,
  options?: {
    skipCache?: boolean;
    onTotalCount?: (total: number) => void;
    onPartial?: (merged: ProjectListBundle) => void;
    isCancelled?: () => boolean;
  },
): Promise<ProjectListBundle | null> {
  const key = requestCacheKey(periodName, userId, options?.skipCache);
  if (options?.skipCache) {
    return fetchProjectListBundleMerged(periodName, userId, accessToken, options);
  }
  return withRequestCache(
    key,
    () => fetchProjectListBundleMerged(periodName, userId, accessToken, options),
    TABLE_TTL_MS,
  );
}
