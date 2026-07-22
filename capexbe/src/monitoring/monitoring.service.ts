import { BadRequestException, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthZService } from '../auth/auth-z.service';
import { maskEmail } from '../shared/pii-hash.util';
import { viewerCanSeeUserPii } from '../shared/pii-access.util';
import {
  createSupabaseClient,
  getSupabaseServiceKey,
} from '../shared/supabase-client.factory';
import { parseMonitoringUsersQuery } from './monitoring.dto';
import {
  loadMonitoringContext,
  loadMonitoringUsersPage,
} from './monitoring-user.loader';

type MonitoringDataCache = {
  expiresAt: number;
  admin: SupabaseClient;
  contextPromise: ReturnType<typeof loadMonitoringContext>;
};

@Injectable()
export class MonitoringService {
  private cache: MonitoringDataCache | null = null;
  private readonly cacheTtlMs = 30_000;

  constructor(private readonly authZ: AuthZService) {}

  private adminClient(): SupabaseClient {
    const key = getSupabaseServiceKey();
    if (!key) {
      throw new BadRequestException('Database service key not configured');
    }
    return createSupabaseClient(key);
  }

  private getCachedContext() {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache;
    }
    const admin = this.adminClient();
    const contextPromise = loadMonitoringContext(admin);
    this.cache = { admin, expiresAt: now + this.cacheTtlMs, contextPromise };
    return this.cache;
  }

  private async assertView(accessToken: string, userId: number): Promise<void> {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'User Monitoring', 'view');
  }

  async loadPageBundle(accessToken: string, body: unknown) {
    const userId = Number((body as Record<string, unknown>)?.userId);
    if (!Number.isFinite(userId)) throw new BadRequestException('Invalid userId');
    await this.assertView(accessToken, userId);
    const cached = this.getCachedContext();
    const ctx = await cached.contextPromise;
    const scoped = buildScopeSummaries(ctx.allRows, ctx.archetypes, ctx.hospitalUnits);
    return {
      summary: {
        totalUsers: ctx.allRows.length,
        onlineNow: ctx.allRows.filter((r) => r.isOnline).length,
        activeUsers: ctx.allRows.filter((r) => r.status === 'Active').length,
        dormantUsers: ctx.allRows.filter((r) => r.status === 'Dormant').length,
        inactiveUsers: ctx.allRows.filter((r) => r.status === 'Inactive').length,
      },
      archetypeSummary: scoped.archetypeSummary,
      unitSummary: scoped.unitSummary,
      archetypes: ctx.archetypes,
      hospitalUnits: ctx.hospitalUnits,
    };
  }

  async loadUsersPage(accessToken: string, body: unknown) {
    const query = parseMonitoringUsersQuery(body);
    await this.assertView(accessToken, query.userId);
    const includePii = await viewerCanSeeUserPii(this.authZ, accessToken, query.userId);
    const cached = this.getCachedContext();
    const ctx = await cached.contextPromise;
    const page = await loadMonitoringUsersPage(cached.admin, query, ctx.allRows);
    if (includePii) return page;
    return {
      ...page,
      rows: page.rows.map((row) => ({
        ...row,
        email: row.email ? maskEmail(row.email) : '',
      })),
    };
  }
}

function emptySummaryRow(key: string, label: string) {
  return { key, label, total: 0, online: 0, active: 0, dormant: 0, inactive: 0 };
}

function bumpSummary(
  row: { total: number; online: number; active: number; dormant: number; inactive: number },
  metric: { isOnline: boolean; status: string },
) {
  row.total += 1;
  if (metric.isOnline) row.online += 1;
  if (metric.status === 'Active') row.active += 1;
  else if (metric.status === 'Dormant') row.dormant += 1;
  else row.inactive += 1;
}

function buildScopeSummaries(
  rows: Array<{ archetypeNames: string[]; unitNames: string[]; isOnline: boolean; status: string }>,
  archetypes: { id: string; name: string }[],
  hospitalUnits: { id: string; name: string; archetypeId: string }[],
) {
  const archMap = new Map(archetypes.map((a) => [a.name, emptySummaryRow(a.id, a.name)]));
  const unitMap = new Map(hospitalUnits.map((hu) => [hu.name, emptySummaryRow(hu.id, hu.name)]));
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
