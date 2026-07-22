import type { SupabaseClient } from '@supabase/supabase-js';
import { BATCH_SIZE } from '../project-list/supabase-helpers';
import {
  getAllArchetypesConfig,
  getAllHospitalUnitsConfig,
  getAllUsers,
} from '../project-list/master-data.loader';
import type {
  MonitoringListFilters,
  MonitoringPageBundleDto,
  MonitoringScopeSummaryRow,
  MonitoringUserRowDto,
  MonitoringUsersPageDto,
  MonitoringUsersQuery,
  UserActivityStatus,
} from './monitoring.dto';
import {
  buildScopeResolutionMaps,
  formatRoleNames,
  resolveUserScopes,
} from './scope-resolution';

const ONLINE_WINDOW_MS = 15 * 60 * 1000;
const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const RECENT_ACTIVITY_DAYS = 365;

type ActivityStats = {
  lastActiveMs: number;
  completedTasks: number;
  createdAdhoc: number;
  isOnline: boolean;
};

function maxMs(...values: number[]): number {
  return values.reduce((m, v) => (v > m ? v : m), 0);
}

function emptySummaryRow(key: string, label: string): MonitoringScopeSummaryRow {
  return { key, label, total: 0, online: 0, active: 0, dormant: 0, inactive: 0 };
}

function bumpSummary(row: MonitoringScopeSummaryRow, metric: MonitoringUserRowDto): void {
  row.total += 1;
  if (metric.isOnline) row.online += 1;
  if (metric.status === 'Active') row.active += 1;
  else if (metric.status === 'Dormant') row.dormant += 1;
  else row.inactive += 1;
}

function deriveStatus(lastActiveMs: number, nowMs: number, isOnline: boolean): UserActivityStatus {
  if (isOnline) return 'Active';
  if (lastActiveMs <= 0) return 'Inactive';
  if (lastActiveMs >= nowMs - ACTIVE_WINDOW_MS) return 'Active';
  return 'Dormant';
}

function calcEngagementScore(stats: ActivityStats, nowMs: number): number {
  const totalActions = stats.completedTasks + stats.createdAdhoc;
  let baseScore = Math.min(100, totalActions * 5);
  if (stats.lastActiveMs > 0) {
    const daysSince = (nowMs - stats.lastActiveMs) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) baseScore *= 0.5;
    else if (daysSince > 7) baseScore *= 0.8;
  } else {
    baseScore = 0;
  }
  if (stats.isOnline) baseScore = Math.min(100, baseScore + 10);
  return Math.round(baseScore);
}

async function fetchRecentRows(
  admin: SupabaseClient,
  tableName: string,
  selectQuery: string,
  dateColumn: string,
  sinceIso: string,
): Promise<Record<string, unknown>[]> {
  let allRows: Record<string, unknown>[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await admin
      .from(tableName)
      .select(selectQuery)
      .gte(dateColumn, sinceIso)
      .range(from, from + BATCH_SIZE - 1);
    if (error) throw new Error(`${tableName}: ${error.message}`);
    const chunk = (data ?? []) as unknown as Record<string, unknown>[];
    if (chunk.length > 0) {
      allRows = [...allRows, ...chunk];
      from += BATCH_SIZE;
      hasMore = chunk.length === BATCH_SIZE;
    } else {
      hasMore = false;
    }
  }
  return allRows;
}

async function loadRecentTaskActivity(admin: SupabaseClient): Promise<Map<number, { lastMs: number; count: number }>> {
  const since = new Date(Date.now() - RECENT_ACTIVITY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows = await fetchRecentRows(
    admin,
    'task_logs',
    'completed_by_user_id, completed_at',
    'completed_at',
    since,
  );
  const map = new Map<number, { lastMs: number; count: number }>();
  for (const row of rows ?? []) {
    const uid = Number((row as { completed_by_user_id?: unknown }).completed_by_user_id);
    if (!Number.isFinite(uid)) continue;
    const at = new Date(String((row as { completed_at?: unknown }).completed_at ?? '')).getTime();
    if (!Number.isFinite(at)) continue;
    const cur = map.get(uid) ?? { lastMs: 0, count: 0 };
    cur.count += 1;
    if (at > cur.lastMs) cur.lastMs = at;
    map.set(uid, cur);
  }
  return map;
}

async function loadRecentAdhocActivity(admin: SupabaseClient): Promise<Map<number, { lastMs: number; count: number }>> {
  const since = new Date(Date.now() - RECENT_ACTIVITY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows = await fetchRecentRows(
    admin,
    'adhoc_tasks',
    'created_by_user_id, created_at',
    'created_at',
    since,
  );
  const map = new Map<number, { lastMs: number; count: number }>();
  for (const row of rows ?? []) {
    const uid = Number((row as { created_by_user_id?: unknown }).created_by_user_id);
    if (!Number.isFinite(uid)) continue;
    const at = new Date(String((row as { created_at?: unknown }).created_at ?? '')).getTime();
    if (!Number.isFinite(at)) continue;
    const cur = map.get(uid) ?? { lastMs: 0, count: 0 };
    cur.count += 1;
    if (at > cur.lastMs) cur.lastMs = at;
    map.set(uid, cur);
  }
  return map;
}

type SessionActivity = { lastMs: number; isOnline: boolean };

async function loadSessionActivity(admin: SupabaseClient): Promise<Map<number, SessionActivity>> {
  const map = new Map<number, SessionActivity>();
  const nowMs = Date.now();
  const onlineCutoff = nowMs - ONLINE_WINDOW_MS;
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await admin
      .from('auth_sessions')
      .select('user_id, last_active_at')
      .is('revoked_at', null)
      .range(from, from + BATCH_SIZE - 1);
    if (error) break;
    const chunk = data ?? [];
    for (const row of chunk) {
      const uid = Number(row.user_id);
      if (!Number.isFinite(uid)) continue;
      const at = new Date(String(row.last_active_at ?? '')).getTime();
      if (!Number.isFinite(at)) continue;
      const prev = map.get(uid);
      const lastMs = maxMs(prev?.lastMs ?? 0, at);
      map.set(uid, {
        lastMs,
        isOnline: lastMs >= onlineCutoff || Boolean(prev?.isOnline),
      });
    }
    if (chunk.length > 0) {
      from += BATCH_SIZE;
      hasMore = chunk.length === BATCH_SIZE;
    } else {
      hasMore = false;
    }
  }
  return map;
}

async function loadLoginAuditActivity(admin: SupabaseClient): Promise<Map<number, number>> {
  try {
    const since = new Date(Date.now() - RECENT_ACTIVITY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const rows = await fetchRecentRows(
      admin,
      'login_audit_logs',
      'user_id, created_at, success',
      'created_at',
      since,
    );
    const map = new Map<number, number>();
    for (const row of rows) {
      if (row.success === false) continue;
      const uid = Number(row.user_id);
      if (!Number.isFinite(uid)) continue;
      const at = new Date(String(row.created_at ?? '')).getTime();
      if (!Number.isFinite(at)) continue;
      map.set(uid, maxMs(map.get(uid) ?? 0, at));
    }
    return map;
  } catch {
    return new Map();
  }
}

function buildUserMetrics(
  users: ReturnType<typeof getAllUsers> extends Promise<infer T> ? T : never,
  scopeMaps: ReturnType<typeof buildScopeResolutionMaps>,
  taskActivity: Map<number, { lastMs: number; count: number }>,
  adhocActivity: Map<number, { lastMs: number; count: number }>,
  sessionActivity: Map<number, SessionActivity>,
  loginActivity: Map<number, number>,
): MonitoringUserRowDto[] {
  const nowMs = Date.now();
  return users.map((user) => {
    const uid = Number(user.id);
    const task = taskActivity.get(uid);
    const adhoc = adhocActivity.get(uid);
    const session = sessionActivity.get(uid);
    const loginLast = loginActivity.get(uid) ?? 0;
    const lastActiveMs = maxMs(
      task?.lastMs ?? 0,
      adhoc?.lastMs ?? 0,
      session?.lastMs ?? 0,
      loginLast,
    );
    const isOnline = Boolean(session?.isOnline);
    const stats: ActivityStats = {
      lastActiveMs,
      completedTasks: task?.count ?? 0,
      createdAdhoc: adhoc?.count ?? 0,
      isOnline,
    };
    const scope = resolveUserScopes(user.assignments, scopeMaps);
    return {
      userId: uid,
      username: String(user.username ?? ''),
      email: String(user.email ?? ''),
      roleName: formatRoleNames(user.assignments),
      unitNames: Array.from(scope.unitNames).sort((a, b) => a.localeCompare(b)),
      archetypeNames: Array.from(scope.archetypeNames).sort((a, b) => a.localeCompare(b)),
      lastActiveAt: lastActiveMs > 0 ? new Date(lastActiveMs).toISOString() : null,
      totalActions: stats.completedTasks + stats.createdAdhoc,
      taskCompletionCount: stats.completedTasks,
      adhocTaskCreatedCount: stats.createdAdhoc,
      engagementScore: calcEngagementScore(stats, nowMs),
      status: deriveStatus(lastActiveMs, nowMs, isOnline),
      isOnline,
    };
  });
}

function applyFilters(rows: MonitoringUserRowDto[], filters: MonitoringListFilters): MonitoringUserRowDto[] {
  const search = filters.search.toLowerCase();
  return rows.filter((row) => {
    if (filters.status === 'online' && !row.isOnline) return false;
    if (filters.status !== 'all' && filters.status !== 'online' && row.status !== filters.status) {
      return false;
    }
    if (filters.archetypeName && !row.archetypeNames.includes(filters.archetypeName)) return false;
    if (filters.unitName && !row.unitNames.includes(filters.unitName)) return false;
    if (!search) return true;
    const hay = [
      row.username,
      row.email,
      row.roleName,
      ...row.unitNames,
      ...row.archetypeNames,
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(search);
  });
}

function buildScopeSummaries(
  rows: MonitoringUserRowDto[],
  archetypes: { id: string; name: string }[],
  hospitalUnits: { id: string; name: string; archetypeId: string }[],
): { archetypeSummary: MonitoringScopeSummaryRow[]; unitSummary: MonitoringScopeSummaryRow[] } {
  const archMap = new Map<string, MonitoringScopeSummaryRow>();
  const unitMap = new Map<string, MonitoringScopeSummaryRow>();

  for (const arch of archetypes) {
    archMap.set(arch.name, emptySummaryRow(arch.id, arch.name));
  }
  for (const hu of hospitalUnits) {
    unitMap.set(hu.name, emptySummaryRow(hu.id, hu.name));
  }

  for (const row of rows) {
    for (const arch of row.archetypeNames) {
      const entry = archMap.get(arch);
      if (entry) bumpSummary(entry, row);
    }
    for (const unit of row.unitNames) {
      const entry = unitMap.get(unit);
      if (entry) bumpSummary(entry, row);
    }
  }

  return {
    archetypeSummary: Array.from(archMap.values()).sort((a, b) => b.active - a.active || a.label.localeCompare(b.label)),
    unitSummary: Array.from(unitMap.values()).sort((a, b) => b.active - a.active || a.label.localeCompare(b.label)),
  };
}

export async function loadMonitoringContext(admin: SupabaseClient) {
  const [users, archetypesRaw, husRaw, taskActivity, adhocActivity, sessionActivity, loginActivity] =
    await Promise.all([
      getAllUsers(admin),
      getAllArchetypesConfig(admin),
      getAllHospitalUnitsConfig(admin),
      loadRecentTaskActivity(admin),
      loadRecentAdhocActivity(admin),
      loadSessionActivity(admin),
      loadLoginAuditActivity(admin),
    ]);

  const archetypes = archetypesRaw
    .map((a) => ({
      id: String(a.id ?? ''),
      name: String(a.name ?? '').trim(),
    }))
    .filter((a) => a.name);
  const hospitalUnits = husRaw
    .map((hu) => ({
      id: String(hu.id ?? ''),
      name: String(hu.name ?? '').trim(),
      archetypeId: String(hu.archetypeId ?? ''),
    }))
    .filter((hu) => hu.name);

  const scopeMaps = buildScopeResolutionMaps(archetypes, hospitalUnits);
  const allRows = buildUserMetrics(
    users,
    scopeMaps,
    taskActivity,
    adhocActivity,
    sessionActivity,
    loginActivity,
  );

  return { allRows, archetypes, hospitalUnits };
}

export async function loadMonitoringPageBundle(admin: SupabaseClient): Promise<MonitoringPageBundleDto> {
  const { allRows, archetypes, hospitalUnits } = await loadMonitoringContext(admin);
  const { archetypeSummary, unitSummary } = buildScopeSummaries(allRows, archetypes, hospitalUnits);

  return {
    summary: {
      totalUsers: allRows.length,
      onlineNow: allRows.filter((r) => r.isOnline).length,
      activeUsers: allRows.filter((r) => r.status === 'Active').length,
      dormantUsers: allRows.filter((r) => r.status === 'Dormant').length,
      inactiveUsers: allRows.filter((r) => r.status === 'Inactive').length,
    },
    archetypeSummary,
    unitSummary,
    archetypes,
    hospitalUnits,
  };
}

export async function loadMonitoringUsersPage(
  _admin: SupabaseClient,
  query: MonitoringUsersQuery,
  preloadedRows?: MonitoringUserRowDto[],
): Promise<MonitoringUsersPageDto> {
  const allRows = preloadedRows ?? (await loadMonitoringContext(_admin)).allRows;
  const filtered = applyFilters(allRows, query);
  filtered.sort((a, b) => {
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    if (a.status !== b.status) {
      const order: Record<UserActivityStatus, number> = { Active: 0, Dormant: 1, Inactive: 2 };
      return order[a.status] - order[b.status];
    }
    const aTime = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
    const bTime = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
    return bTime - aTime;
  });

  const from = (query.page - 1) * query.pageSize;
  const slice = filtered.slice(from, from + query.pageSize);
  return {
    rows: slice,
    page: query.page,
    pageSize: query.pageSize,
    totalCount: filtered.length,
    hasMore: from + query.pageSize < filtered.length,
  };
}
