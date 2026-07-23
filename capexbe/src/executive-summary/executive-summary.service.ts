import { Injectable } from '@nestjs/common';
import { AuthZService } from '../auth/auth-z.service';
import { fetchAllRecords, toCamelCase } from '../project-list/supabase-helpers';
import { loadBudgetByPeriodName } from '../budget-hu/budget-period.loader';
import { FsAuthService } from '../fs/fs-auth.service';
import { CACHE_TTL_MS, cacheKeys } from '../shared/cache-keys';
import { perfCacheGet, perfCacheSet } from '../shared/perf-cache';
import {
  parseListFilters,
  parsePeriodUserBody,
  parseProjectsPageBody,
  type ExecutiveSummaryListFilters,
} from './executive-summary.dto';
import { loadExecutiveSummaryProjectsPage } from './executive-summary-projects.loader';
import { loadExecutiveSummaryStats } from './executive-summary-stats.loader';
import { loadExecutiveDashboardMetrics } from './executive-summary-dashboard.loader';

const EXEC_DASHBOARD_CACHE_TTL_MS = CACHE_TTL_MS.DASHBOARD;
const inflightDashboardMetrics = new Map<string, Promise<Record<string, unknown>>>();

function filtersCacheKey(filters: ExecutiveSummaryListFilters): string {
  const hu = [...filters.huCodes].map((c) => c.trim().toLowerCase()).sort().join(',');
  return `${filters.archetypeId ?? ''}:${filters.capexType}:${filters.status}:${hu}`;
}

@Injectable()
export class ExecutiveSummaryService {
  constructor(
    private readonly fsAuth: FsAuthService,
    private readonly authZ: AuthZService,
  ) {}

  /** Lightweight period shell for header (no full project tree). */
  async loadPageBundle(accessToken: string, body: unknown) {
    const { userId, periodName } = parsePeriodUserBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Executive Summary', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const pn = periodName.trim();

    const [periodRow, categoriesRaw, husRaw, archetypesRaw] = await Promise.all([
      client.from('budget_periods').select('period_name, start_date, end_date, multi_year_name').eq('period_name', pn).maybeSingle(),
      fetchAllRecords(client, 'budget_category_configs', 'id, name'),
      fetchAllRecords(client, 'hospital_units_config', 'id, code, name, archetype_id'),
      fetchAllRecords(client, 'archetypes_config', 'id, name'),
    ]);

    const periodMeta = periodRow.data
      ? {
          periodName: String(periodRow.data.period_name ?? pn),
          startDate: periodRow.data.start_date ?? '',
          endDate: periodRow.data.end_date ?? '',
          multiYearName: periodRow.data.multi_year_name ?? '',
        }
      : null;

    return {
      periodName: pn,
      periodMeta,
      categories: categoriesRaw ? categoriesRaw.map(toCamelCase) : [],
      hospitalUnits: husRaw ? husRaw.map(toCamelCase) : [],
      archetypes: archetypesRaw ? archetypesRaw.map(toCamelCase) : [],
    };
  }

  /** Aggregated KPI / lifecycle counts — server-side filters + search. */
  async loadStats(accessToken: string, body: unknown) {
    const { userId, periodName } = parsePeriodUserBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Executive Summary', 'view');
    const filters = parseListFilters(body);
    const search = String((body as Record<string, unknown>)?.search ?? '').trim();
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    return loadExecutiveSummaryStats(client, periodName, filters, search);
  }

  /** Paginated portfolio registry rows. */
  async loadProjectsPage(accessToken: string, body: unknown) {
    const query = parseProjectsPageBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, query.userId, 'Executive Summary', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, query.userId);
    return loadExecutiveSummaryProjectsPage(client, query);
  }

  /** CEO dashboard aggregates — KPI, charts, alerts (archetype-scoped). */
  async loadDashboardMetrics(accessToken: string, body: unknown) {
    const { userId, periodName } = parsePeriodUserBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Executive Summary', 'view');
    const filters = parseListFilters(body);
    const pn = periodName.trim();
    const cacheKey = cacheKeys.executiveDashboardMetrics(userId, pn, filtersCacheKey(filters));

    const cached = await perfCacheGet<Record<string, unknown>>(cacheKey);
    if (cached) return cached;

    const inflight = inflightDashboardMetrics.get(cacheKey);
    if (inflight) return inflight;

    const promise = this.computeDashboardMetrics(accessToken, userId, pn, filters).then(async (payload) => {
      await perfCacheSet(cacheKey, payload, EXEC_DASHBOARD_CACHE_TTL_MS);
      return payload;
    });
    inflightDashboardMetrics.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      inflightDashboardMetrics.delete(cacheKey);
    }
  }

  private async computeDashboardMetrics(
    accessToken: string,
    userId: number,
    pn: string,
    filters: ExecutiveSummaryListFilters,
  ) {
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);

    const [metrics, periodRow] = await Promise.all([
      loadExecutiveDashboardMetrics(client, pn, filters),
      client
        .from('budget_periods')
        .select('period_name, start_date, end_date, multi_year_name')
        .eq('period_name', pn)
        .maybeSingle(),
    ]);

    const periodMeta = periodRow.data
      ? {
          periodName: String(periodRow.data.period_name ?? pn),
          startDate: periodRow.data.start_date ?? '',
          endDate: periodRow.data.end_date ?? '',
          multiYearName: periodRow.data.multi_year_name ?? '',
        }
      : null;

    return { ...metrics, periodMeta };
  }

  /** Fallback: full budget tree (legacy clients only). */
  async loadFullPeriod(accessToken: string, body: unknown) {
    const { userId, periodName } = parsePeriodUserBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Executive Summary', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const period = await loadBudgetByPeriodName(client, periodName.trim());
    return { period };
  }
}
