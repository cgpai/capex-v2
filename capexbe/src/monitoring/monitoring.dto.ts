import { BadRequestException } from '@nestjs/common';

export type UserActivityStatus = 'Active' | 'Dormant' | 'Inactive';

export type MonitoringListFilters = {
  search: string;
  status: 'all' | UserActivityStatus | 'online';
  archetypeName: string | null;
  unitName: string | null;
};

export type MonitoringUsersQuery = MonitoringListFilters & {
  userId: number;
  page: number;
  pageSize: number;
};

export type MonitoringUserRowDto = {
  userId: number;
  username: string;
  email: string;
  roleName: string;
  unitNames: string[];
  archetypeNames: string[];
  lastActiveAt: string | null;
  totalActions: number;
  taskCompletionCount: number;
  adhocTaskCreatedCount: number;
  engagementScore: number;
  status: UserActivityStatus;
  isOnline: boolean;
};

export type MonitoringScopeSummaryRow = {
  key: string;
  label: string;
  total: number;
  online: number;
  active: number;
  dormant: number;
  inactive: number;
};

export type MonitoringPageBundleDto = {
  summary: {
    totalUsers: number;
    onlineNow: number;
    activeUsers: number;
    dormantUsers: number;
    inactiveUsers: number;
  };
  archetypeSummary: MonitoringScopeSummaryRow[];
  unitSummary: MonitoringScopeSummaryRow[];
  archetypes: { id: string; name: string }[];
  hospitalUnits: { id: string; name: string; archetypeId: string }[];
};

export type MonitoringUsersPageDto = {
  rows: MonitoringUserRowDto[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
};

export function parseMonitoringUserBody(body: unknown): { userId: number } {
  const b = (body ?? {}) as Record<string, unknown>;
  const userId = Number(b.userId);
  if (!Number.isFinite(userId)) throw new BadRequestException('Invalid userId');
  return { userId };
}

function parseStatusFilter(v: unknown): MonitoringListFilters['status'] {
  const s = String(v ?? 'all').trim();
  if (s === 'Active' || s === 'Dormant' || s === 'Inactive' || s === 'online' || s === 'all') {
    return s;
  }
  return 'all';
}

export function parseMonitoringListFilters(body: unknown): MonitoringListFilters {
  const b = (body ?? {}) as Record<string, unknown>;
  const archetypeName = b.archetypeName != null && String(b.archetypeName).trim()
    ? String(b.archetypeName).trim()
    : null;
  const unitName = b.unitName != null && String(b.unitName).trim()
    ? String(b.unitName).trim()
    : null;
  return {
    search: String(b.search ?? '').trim(),
    status: parseStatusFilter(b.status),
    archetypeName,
    unitName,
  };
}

export function parseMonitoringUsersQuery(body: unknown): MonitoringUsersQuery {
  const { userId } = parseMonitoringUserBody(body);
  const filters = parseMonitoringListFilters(body);
  const b = (body ?? {}) as Record<string, unknown>;
  const page = Math.max(1, Math.floor(Number(b.page) || 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(Number(b.pageSize) || 25)));
  return { userId, page, pageSize, ...filters };
}
