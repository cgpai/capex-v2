import type {
  UserActivityMetric,
  UserMonitoringPageBundle,
  UserMonitoringUsersPage,
} from '../types';
import { isBackendConfigured, postBackend } from '../lib/backendApiClient';

export type UserMonitoringListFilters = {
  search: string;
  status: 'all' | 'Active' | 'Dormant' | 'Inactive' | 'online';
  archetypeName: string | null;
  unitName: string | null;
};

export type UserMonitoringUsersQueryParams = UserMonitoringListFilters & {
  userId: number;
  page: number;
  pageSize: number;
};

export function userMonitoringFiltersCacheKey(filters: UserMonitoringListFilters): string {
  return [
    filters.search.trim().toLowerCase(),
    filters.status,
    filters.archetypeName ?? '',
    filters.unitName ?? '',
  ].join('\u0001');
}

export async function fetchUserMonitoringPageBundleFromBackend(
  userId: number,
): Promise<UserMonitoringPageBundle | null> {
  if (!isBackendConfigured()) return null;
  const data = await postBackend<Partial<UserMonitoringPageBundle>>(
    '/monitoring/page-bundle',
    { userId },
    { source: 'userMonitoring.pageBundle' },
  );
  if (!data) return null;
  return {
    summary: {
      totalUsers: Number(data.summary?.totalUsers ?? 0),
      onlineNow: Number(data.summary?.onlineNow ?? 0),
      activeUsers: Number(data.summary?.activeUsers ?? 0),
      dormantUsers: Number(data.summary?.dormantUsers ?? 0),
      inactiveUsers: Number(data.summary?.inactiveUsers ?? 0),
    },
    archetypeSummary: Array.isArray(data.archetypeSummary) ? data.archetypeSummary : [],
    unitSummary: Array.isArray(data.unitSummary) ? data.unitSummary : [],
    archetypes: Array.isArray(data.archetypes) ? data.archetypes : [],
    hospitalUnits: Array.isArray(data.hospitalUnits) ? data.hospitalUnits : [],
  };
}

export async function fetchUserMonitoringUsersPageFromBackend(
  params: UserMonitoringUsersQueryParams,
): Promise<UserMonitoringUsersPage | null> {
  if (!isBackendConfigured()) return null;
  const data = await postBackend<Partial<UserMonitoringUsersPage>>(
    '/monitoring/users/query',
    {
      userId: params.userId,
      page: params.page,
      pageSize: params.pageSize,
      search: params.search,
      status: params.status,
      archetypeName: params.archetypeName ?? undefined,
      unitName: params.unitName ?? undefined,
    },
    { source: 'userMonitoring.usersQuery' },
  );
  if (!data) return null;
  return {
    rows: Array.isArray(data.rows) ? (data.rows as UserActivityMetric[]) : [],
    page: Number(data.page ?? params.page),
    pageSize: Number(data.pageSize ?? params.pageSize),
    totalCount: Number(data.totalCount ?? 0),
    hasMore: Boolean(data.hasMore),
  };
}

/** @deprecated Legacy single-shot bundle — prefer pageBundle + usersQuery. */
export type UserMonitoringBundle = {
  users: UserActivityMetric[];
  roles: never[];
};

export async function fetchUserMonitoringBundleFromBackend(
  userId?: number,
): Promise<UserMonitoringBundle | null> {
  if (!Number.isFinite(userId)) return null;
  const [bundle, page] = await Promise.all([
    fetchUserMonitoringPageBundleFromBackend(userId as number),
    fetchUserMonitoringUsersPageFromBackend({
      userId: userId as number,
      page: 1,
      pageSize: 25,
      search: '',
      status: 'all',
      archetypeName: null,
      unitName: null,
    }),
  ]);
  if (!bundle && !page) return null;
  return {
    users: page?.rows ?? [],
    roles: [],
  };
}
