import type { BudgetMultiYear, BudgetPeriod } from '../types';
import { getCurrentAppUserIdFromSession } from '../features/configuration/shared/configSession';
import { fetchConfigurationSlicesFromBackend } from './configurationApi';
import { getAccessTokenForBackend } from '../lib/authSession';
import { resolveMyTasksAccessToken } from './myTasksApi';
import {
  fetchBudgetMultiYearPageBundleFromBackend,
  fetchMultiYearPeriodBudgetsFromBackend,
} from './budgetMultiYearPageApi';
import { isCapexBeConfigured, postToCapexBe } from '../lib/capexBeClient';

function resolveUserId(userId?: number | null): number | null {
  if (userId != null && Number.isFinite(userId)) return userId;
  return getCurrentAppUserIdFromSession();
}

async function resolveToken(): Promise<string | null> {
  return resolveMyTasksAccessToken(getAccessTokenForBackend);
}

export async function readMultiYearsFromBackend(userId?: number | null): Promise<BudgetMultiYear[] | null> {
  const uid = resolveUserId(userId);
  if (uid == null || !isCapexBeConfigured()) return null;
  const bundle = await fetchBudgetMultiYearPageBundleFromBackend(uid);
  return bundle?.multiYears ?? null;
}

export async function readPeriodSummariesFromBackend(userId?: number | null): Promise<BudgetPeriod[] | null> {
  const uid = resolveUserId(userId);
  if (uid == null || !isCapexBeConfigured()) return null;
  const token = await resolveToken();
  const pack = await fetchConfigurationSlicesFromBackend(token, uid, ['allPeriods']);
  const rows = pack?.allPeriods;
  return Array.isArray(rows) ? (rows as BudgetPeriod[]) : null;
}

export async function readPeriodCategoryBudgetsFromBackend(
  multiYearName: string,
  userId?: number | null,
): Promise<BudgetPeriod[] | null> {
  const uid = resolveUserId(userId);
  if (uid == null || !multiYearName.trim()) return null;
  const result = await fetchMultiYearPeriodBudgetsFromBackend(uid, multiYearName);
  return result?.periods ?? null;
}

export async function readBudgetPeriodFromBackend(
  periodName: string,
  userId?: number | null,
): Promise<BudgetPeriod | null | undefined> {
  const uid = resolveUserId(userId);
  if (uid == null || !periodName.trim()) return undefined;
  if (!isCapexBeConfigured()) return undefined;
  try {
    const token = await resolveToken();
    const body = await postToCapexBe<{ budgetPeriod?: BudgetPeriod | null }>(
      '/budget-hu/period',
      { periodName: periodName.trim(), userId: uid },
      token,
    );
    return body.budgetPeriod ?? null;
  } catch {
    return undefined;
  }
}

export async function readBudgetPeriodStructureFromBackend(
  periodName: string,
  userId?: number | null,
): Promise<{ archetypes: BudgetPeriod['archetypes'] } | null | undefined> {
  const uid = resolveUserId(userId);
  if (uid == null || !periodName.trim()) return undefined;
  if (!isCapexBeConfigured()) return undefined;
  try {
    const token = await resolveToken();
    const body = await postToCapexBe<{ archetypes?: BudgetPeriod['archetypes'] }>(
      '/budget-hu/period-structure',
      { periodName: periodName.trim(), userId: uid },
      token,
    );
    if (!body?.archetypes) return null;
    return { archetypes: body.archetypes };
  } catch {
    return undefined;
  }
}

export async function readBudgetPeriodWithFallback<T>(
  periodName: string,
  userId?: number | null,
): Promise<T | null | undefined> {
  const fromBe = await readBudgetPeriodFromBackend(periodName, userId);
  if (fromBe !== undefined) return (fromBe ?? null) as T | null;
  return null;
}

export async function readAllBudgetPeriodsWithFallback(
  userId?: number | null,
): Promise<BudgetPeriod[]> {
  const summaries = await readPeriodSummariesFromBackend(userId);
  return summaries ?? [];
}
