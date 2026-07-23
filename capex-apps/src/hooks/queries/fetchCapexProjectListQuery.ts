import { fetchProjectListPageBundle, fetchProjectListQuery } from '@/services/capexProjectListApi';
import type { ProjectListQueryParams, ProjectListQueryResult } from '@/services/projectListQueryTypes';
import { withRequestCache } from '@/lib/requestCache';

export type { ProjectListQueryParams, ProjectListQueryResult };

const QUERY_REQUEST_TTL_MS = 5 * 60 * 1000;
/** Bump when server-side list read policy changes (invalidates stale table disk cache). */
const PROJECT_LIST_SCOPE_CACHE_REVISION = 'v8-slim-wire-payload';

/** Server-side table fetch with in-flight dedupe (disk write di halaman / prefetch). */
export async function fetchCapexProjectListQuery(
  params: ProjectListQueryParams,
  accessToken?: string | null,
): Promise<ProjectListQueryResult> {
  if (params.skipCache) {
    return fetchProjectListQuery(params, accessToken);
  }
  const cacheKey = `capex-project-list:query:${projectListFiltersCacheKey(params)}:${params.page}:${params.pageSize}`;
  return withRequestCache(
    cacheKey,
    () => fetchProjectListQuery(params, accessToken),
    QUERY_REQUEST_TTL_MS,
  );
}

/** Alias — same payload as query; prefers `/project-list/page-bundle` when available. */
export async function fetchCapexProjectListPageBundle(
  params: ProjectListQueryParams,
  accessToken?: string | null,
): Promise<ProjectListQueryResult> {
  if (params.skipCache) {
    return fetchProjectListPageBundle(params, accessToken);
  }
  const cacheKey = `capex-project-list:page-bundle:${projectListFiltersCacheKey(params)}:${params.page}:${params.pageSize}`;
  return withRequestCache(
    cacheKey,
    () => fetchProjectListPageBundle(params, accessToken),
    QUERY_REQUEST_TTL_MS,
  );
}

export function projectListFiltersCacheKey(filters: ProjectListQueryParams): string {
  const { page: _p, pageSize: _s, skipCache: _c, exportAll: _e, ...rest } = filters;
  return `${PROJECT_LIST_SCOPE_CACHE_REVISION}:${JSON.stringify(rest)}`;
}
