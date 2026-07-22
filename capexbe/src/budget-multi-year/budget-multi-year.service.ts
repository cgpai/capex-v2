import { BadRequestException, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthZService } from '../auth/auth-z.service';
import { fetchAllRecords, fetchRecordsInBatches, toCamelCase } from '../project-list/supabase-helpers';
import {
  perfCacheDelete,
  perfCacheDeleteByPrefix,
  perfCacheGet,
  perfCacheSet,
} from '../shared/perf-cache';
import { CACHE_TTL_MS, cacheKeys } from '../shared/cache-keys';
import {
  buildMultiYearsFromRows,
  loadPeriodCategoryBudgetsForMultiYear,
} from './budget-multi-year.util';

const BUDGET_HIERARCHY = 'Budget';
const CATEGORY_SELECT = 'id, name, is_active';

async function getActiveBudgetCategories(client: SupabaseClient): Promise<any[]> {
  const { data, error } = await client
    .from('budget_category_configs')
    .select(CATEGORY_SELECT)
    .eq('is_active', true);
  if (error) throw new BadRequestException(error.message);
  return (data ?? [])
    .map((row) => {
      const camel = toCamelCase(row) as Record<string, unknown>;
      const id = String(camel.id ?? '');
      const name = String(camel.name ?? '');
      if (!id || !name) return null;
      return { id, name, isActive: true };
    })
    .filter((row): row is { id: string; name: string; isActive: boolean } => row != null);
}

@Injectable()
export class BudgetMultiYearService {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly authZ: AuthZService,
  ) {}

  private readonly responseCache = new Map<string, { expiresAt: number; data: unknown }>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  private pruneCache(): void {
    const now = Date.now();
    for (const [k, v] of this.responseCache.entries()) {
      if (v.expiresAt <= now) this.responseCache.delete(k);
    }
  }

  private getFromProcessCache<T>(key: string): T | null {
    this.pruneCache();
    const hit = this.responseCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.data as T;
    return null;
  }

  private setProcessCache(key: string, data: unknown, ttlMs: number): void {
    this.responseCache.set(key, { expiresAt: Date.now() + ttlMs, data });
  }

  private async dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = run();
    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }

  private async invalidateUserCaches(userId: number): Promise<void> {
    const prefix = `app:table:budget-multi-year:`;
    for (const key of [...this.responseCache.keys()]) {
      if (key.includes(prefix) && key.includes(`:${userId}`)) {
        this.responseCache.delete(key);
        this.inflight.delete(key);
      }
    }
    await perfCacheDelete(cacheKeys.budgetMultiYearPage(userId));
    await perfCacheDeleteByPrefix(`app:table:budget-multi-year:period-budgets:${userId}:`);
  }

  private async loadPageBundleFromDb(client: SupabaseClient) {
    const [multiYearRows, periodRows, categories] = await Promise.all([
      fetchAllRecords(client, 'budget_multi_years', '*'),
      fetchAllRecords(client, 'budget_periods', 'period_name, multi_year_name, start_date, end_date'),
      getActiveBudgetCategories(client),
    ]);

    const periodNames = (periodRows ?? [])
      .map((p) => String(p.period_name ?? ''))
      .filter(Boolean);
    const categoryBudgets = periodNames.length
      ? await fetchRecordsInBatches(
          client,
          'budget_period_category_budgets',
          'period_name',
          periodNames,
          'period_name, budget_category_id, budget_plan, budget_carry_forward, budget_allocated, approved_budget, consumed_budget',
        )
      : [];

    return {
      multiYears: buildMultiYearsFromRows(multiYearRows, periodRows, categoryBudgets),
      categories,
    };
  }

  async loadPageBundle(accessToken: string, userId: number) {
    await this.authZ.assertHierarchyPermission(accessToken, userId, BUDGET_HIERARCHY, 'view');
    const key = cacheKeys.budgetMultiYearPage(userId);

    const processHit = this.getFromProcessCache<{ multiYears: any[]; categories: any[] }>(key);
    if (processHit) return processHit;

    const sharedHit = await perfCacheGet<{ multiYears: any[]; categories: any[] }>(key);
    if (sharedHit) {
      this.setProcessCache(key, sharedHit, CACHE_TTL_MS.TABLE);
      return sharedHit;
    }

    return this.dedupe(key, async () => {
      const { client } = await this.authContext.getRlsClient(accessToken, userId);
      const payload = await this.loadPageBundleFromDb(client);
      this.setProcessCache(key, payload, CACHE_TTL_MS.TABLE);
      await perfCacheSet(key, payload, CACHE_TTL_MS.TABLE);
      return payload;
    });
  }

  async loadPeriodBudgets(accessToken: string, userId: number, multiYearName: string) {
    await this.authZ.assertHierarchyPermission(accessToken, userId, BUDGET_HIERARCHY, 'view');
    const trimmed = multiYearName.trim();
    if (!trimmed) throw new BadRequestException('multiYearName is required');

    const key = cacheKeys.budgetMultiYearPeriodBudgets(userId, trimmed);
    const processHit = this.getFromProcessCache<{ periods: any[]; categories: any[] }>(key);
    if (processHit) return processHit;

    const sharedHit = await perfCacheGet<{ periods: any[]; categories: any[] }>(key);
    if (sharedHit) {
      this.setProcessCache(key, sharedHit, CACHE_TTL_MS.TABLE);
      return sharedHit;
    }

    return this.dedupe(key, async () => {
      const { client } = await this.authContext.getRlsClient(accessToken, userId);
      const [periods, categories] = await Promise.all([
        loadPeriodCategoryBudgetsForMultiYear(client, trimmed),
        getActiveBudgetCategories(client),
      ]);
      const payload = { periods, categories };
      this.setProcessCache(key, payload, CACHE_TTL_MS.TABLE);
      await perfCacheSet(key, payload, CACHE_TTL_MS.TABLE);
      return payload;
    });
  }

  async saveMultiYear(accessToken: string, userId: number, multiYear: Record<string, unknown>) {
    await this.authZ.assertHierarchyPermission(accessToken, userId, BUDGET_HIERARCHY, 'update');
    const { client } = await this.authContext.getRlsClient(accessToken, userId);

    const name = String(multiYear.name ?? '').trim();
    const startYear = Number(multiYear.startYear);
    const endYear = Number(multiYear.endYear);
    const budget = (multiYear.budget ?? {}) as Record<string, unknown>;
    if (!name || !Number.isFinite(startYear) || !Number.isFinite(endYear)) {
      throw new BadRequestException('Invalid multi-year payload');
    }

    const flatData = {
      name,
      start_year: startYear,
      end_year: endYear,
      budget_plan: Number(budget.budgetPlan ?? 0),
    };

    const { error } = await client.from('budget_multi_years').upsert(flatData);
    if (error) throw new BadRequestException(error.message);

    await this.invalidateUserCaches(userId);
    return { ok: true };
  }

  async createPeriod(
    accessToken: string,
    userId: number,
    payload: {
      periodName: string;
      startDate: string;
      endDate: string;
      multiYearName: string;
    },
  ) {
    await this.authZ.assertHierarchyPermission(accessToken, userId, BUDGET_HIERARCHY, 'create');
    const { client } = await this.authContext.getRlsClient(accessToken, userId);

    const periodName = payload.periodName.trim();
    const multiYearName = payload.multiYearName.trim();
    const startDate = payload.startDate.trim();
    const endDate = payload.endDate.trim();
    if (!periodName || !multiYearName || !startDate || !endDate) {
      throw new BadRequestException('Invalid period payload');
    }

    const categories = await getActiveBudgetCategories(client);
    const budgetRows = categories.map((cat) => ({
      period_name: periodName,
      budget_category_id: cat.id,
      budget_plan: 0,
      budget_carry_forward: 0,
      budget_allocated: 0,
      approved_budget: 0,
      consumed_budget: 0,
      asset_count: 0,
      no_budget_asset_count: 0,
    }));

    const { error: periodError } = await client.from('budget_periods').insert({
      period_name: periodName,
      multi_year_name: multiYearName,
      start_date: startDate,
      end_date: endDate,
    });
    if (periodError) throw new BadRequestException(periodError.message);

    if (budgetRows.length) {
      const { error: budgetError } = await client.from('budget_period_category_budgets').upsert(budgetRows, {
        onConflict: 'period_name,budget_category_id',
      });
      if (budgetError) throw new BadRequestException(budgetError.message);
    }

    await this.invalidateUserCaches(userId);
    return { ok: true };
  }

  async savePeriodCategoryPlans(
    accessToken: string,
    userId: number,
    period: Record<string, unknown>,
    categoryIds?: string[],
  ) {
    await this.authZ.assertHierarchyPermission(accessToken, userId, BUDGET_HIERARCHY, 'update');
    const { client } = await this.authContext.getRlsClient(accessToken, userId);

    const periodName = String(period.periodName ?? '').trim();
    const budget = period.budget;
    if (!periodName || !budget || typeof budget !== 'object') {
      throw new BadRequestException('Invalid period budget payload');
    }

    const allowedIds = categoryIds?.length ? new Set(categoryIds.map(String)) : null;
    const entries = Object.entries(budget as Record<string, unknown>).filter(([categoryId]) =>
      allowedIds ? allowedIds.has(categoryId) : true,
    );
    if (!entries.length) return { ok: true };

    const { data: existingRows, error: readError } = await client
      .from('budget_period_category_budgets')
      .select(
        'period_name, budget_category_id, budget_plan, budget_carry_forward, budget_allocated, approved_budget, consumed_budget, asset_count, no_budget_asset_count',
      )
      .eq('period_name', periodName);
    if (readError) throw new BadRequestException(readError.message);

    const existingByCategory = new Map(
      (existingRows ?? []).map((row) => [String(row.budget_category_id), row]),
    );

    const rows = entries.map(([categoryId, value]) => {
      const item = (value ?? {}) as Record<string, unknown>;
      const prev = existingByCategory.get(categoryId);
      return {
        period_name: periodName,
        budget_category_id: categoryId,
        budget_plan: Number(item.budgetPlan ?? prev?.budget_plan ?? 0),
        budget_carry_forward: Number(prev?.budget_carry_forward ?? item.budgetCarryForward ?? 0),
        budget_allocated: Number(prev?.budget_allocated ?? item.budgetAllocated ?? 0),
        approved_budget: Number(prev?.approved_budget ?? item.approvedBudget ?? 0),
        consumed_budget: Number(prev?.consumed_budget ?? item.consumedBudget ?? 0),
        asset_count: Number(prev?.asset_count ?? item.assetCount ?? 0),
        no_budget_asset_count: Number(prev?.no_budget_asset_count ?? item.noBudgetAssetCount ?? 0),
      };
    });

    const { error } = await client.from('budget_period_category_budgets').upsert(rows, {
      onConflict: 'period_name,budget_category_id',
    });
    if (error) throw new BadRequestException(error.message);

    await this.invalidateUserCaches(userId);
    return { ok: true };
  }

  async saveArchetypeBudgetPlans(
    accessToken: string,
    userId: number,
    periodName: string,
    rows: Array<{ archetypeId?: string; categoryId?: string; budgetPlan?: number }>,
  ) {
    await this.authZ.assertHierarchyPermission(accessToken, userId, BUDGET_HIERARCHY, 'update');
    const { client } = await this.authContext.getRlsClient(accessToken, userId);

    const pn = String(periodName ?? '').trim();
    if (!pn) throw new BadRequestException('periodName is required');

    const upserts: Array<{
      period_name: string;
      archetype_id: string;
      budget_category_id: string;
      budget_plan: number;
    }> = [];
    const deletes: Array<{ archetypeId: string; categoryId: string }> = [];

    for (const row of rows ?? []) {
      const archetypeId = String(row.archetypeId ?? '').trim();
      const categoryId = String(row.categoryId ?? '').trim();
      if (!archetypeId || !categoryId) continue;
      const budgetPlan = Number(row.budgetPlan ?? 0);
      if (budgetPlan > 0) {
        upserts.push({
          period_name: pn,
          archetype_id: archetypeId,
          budget_category_id: categoryId,
          budget_plan: budgetPlan,
        });
      } else {
        deletes.push({ archetypeId, categoryId });
      }
    }

    if (upserts.length) {
      const { error } = await client.from('budget_period_archetype_budgets').upsert(upserts, {
        onConflict: 'period_name,archetype_id,budget_category_id',
      });
      if (error) throw new BadRequestException(error.message);
    }

    for (const del of deletes) {
      const { error } = await client
        .from('budget_period_archetype_budgets')
        .delete()
        .eq('period_name', pn)
        .eq('archetype_id', del.archetypeId)
        .eq('budget_category_id', del.categoryId);
      if (error) throw new BadRequestException(error.message);
    }

    await this.invalidateUserCaches(userId);
    await perfCacheDelete(cacheKeys.budgetHuPeriod(userId, pn));
    await perfCacheDeleteByPrefix(`app:table:budget-hu:page:${userId}:${pn.toLowerCase()}`);
    await perfCacheDeleteByPrefix(`app:table:budget-hu:asset-counts:${userId}:${pn.toLowerCase()}`);

    return { ok: true };
  }

  async saveHuBudgetPlans(
    accessToken: string,
    userId: number,
    periodName: string,
    rows: Array<{ hospitalUnitId?: string; categoryId?: string; budgetPlan?: number }>,
  ) {
    await this.authZ.assertHierarchyPermission(accessToken, userId, BUDGET_HIERARCHY, 'update');
    const { client } = await this.authContext.getRlsClient(accessToken, userId);

    const pn = String(periodName ?? '').trim();
    if (!pn) throw new BadRequestException('periodName is required');

    const upserts: Array<{
      period_name: string;
      hospital_unit_id: string;
      budget_category_id: string;
      budget_plan: number;
    }> = [];
    const deletes: Array<{ hospitalUnitId: string; categoryId: string }> = [];

    for (const row of rows ?? []) {
      const hospitalUnitId = String(row.hospitalUnitId ?? '').trim();
      const categoryId = String(row.categoryId ?? '').trim();
      if (!hospitalUnitId || !categoryId) continue;
      const budgetPlan = Number(row.budgetPlan ?? 0);
      if (budgetPlan > 0) {
        upserts.push({
          period_name: pn,
          hospital_unit_id: hospitalUnitId,
          budget_category_id: categoryId,
          budget_plan: budgetPlan,
        });
      } else {
        deletes.push({ hospitalUnitId, categoryId });
      }
    }

    if (upserts.length) {
      const { error } = await client.from('budget_period_hospital_unit_budgets').upsert(upserts, {
        onConflict: 'period_name,hospital_unit_id,budget_category_id',
      });
      if (error) throw new BadRequestException(error.message);
    }

    for (const del of deletes) {
      const { error } = await client
        .from('budget_period_hospital_unit_budgets')
        .delete()
        .eq('period_name', pn)
        .eq('hospital_unit_id', del.hospitalUnitId)
        .eq('budget_category_id', del.categoryId);
      if (error) throw new BadRequestException(error.message);
    }

    await this.invalidateUserCaches(userId);
    await perfCacheDelete(cacheKeys.budgetHuPeriod(userId, pn));
    await perfCacheDeleteByPrefix(`app:table:budget-hu:page:${userId}:${pn.toLowerCase()}`);
    await perfCacheDeleteByPrefix(`app:table:budget-hu:asset-counts:${userId}:${pn.toLowerCase()}`);

    return { ok: true };
  }
}
