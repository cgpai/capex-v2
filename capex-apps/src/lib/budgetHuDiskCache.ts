import type { Archetype, BudgetPeriod, HospitalUnit, Project } from '@/types';
import type { BudgetHuConfigBundle, BudgetHuPageBundle } from '@/services/budgetHuPageApi';
import { isAppBudgetPeriodStructureShell } from '@/hooks/queries/fetchBudgetHuPageData';
import { readPeriodShellCache } from '@/lib/periodSelectionCache';
import { readCachedAuthUser } from '@/lib/authSessionCache';

const PERIOD_PREFIX = 'capexBudgetPeriodCache:v1';
const CONFIG_PREFIX = 'capexBudgetHuConfigCache:v1';
const PAGE_PREFIX = 'capexBudgetHuPageCache:v1';

const PERIOD_TTL_MS = 30 * 60 * 1000;
const CONFIG_TTL_MS = 30 * 60 * 1000;
const PAGE_TTL_MS = 5 * 60 * 1000;

type CacheEnvelope<T> = { savedAt: number; payload: T };

function periodKey(periodName: string, userId: number) {
  return `${PERIOD_PREFIX}:${periodName.trim()}:${userId}`;
}

function configKey(userId: number) {
  return `${CONFIG_PREFIX}:${userId}`;
}

function pageKey(periodName: string, userId: number) {
  return `${PAGE_PREFIX}:${periodName.trim()}:${userId}`;
}

function readEnvelope<T>(storage: Storage | undefined, key: string): CacheEnvelope<T> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEnvelope<T>;
  } catch {
    return null;
  }
}

function writeEnvelope<T>(storage: Storage | undefined, key: string, envelope: CacheEnvelope<T>): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(envelope));
  } catch {
    /* quota */
  }
}

function readFromStorages<T>(key: string): CacheEnvelope<T> | null {
  if (typeof window === 'undefined') return null;
  const fromSession = readEnvelope<T>(window.sessionStorage, key);
  if (fromSession) return fromSession;
  const fromLocal = readEnvelope<T>(window.localStorage, key);
  if (fromLocal) {
    writeEnvelope(window.sessionStorage, key, fromLocal);
    return fromLocal;
  }
  return null;
}

function writeToStorages<T>(key: string, payload: T): void {
  if (typeof window === 'undefined') return;
  const envelope = { savedAt: Date.now(), payload };
  writeEnvelope(window.sessionStorage, key, envelope);
  writeEnvelope(window.localStorage, key, envelope);
}

function isFresh(savedAt: number, ttlMs: number): boolean {
  return !!savedAt && Date.now() - savedAt <= ttlMs;
}

/** Total projects across all HUs — used to detect partial/stale cache. */
export function countBudgetPeriodProjects(period: BudgetPeriod | null | undefined): number {
  if (!period?.archetypes?.length) return 0;
  return period.archetypes.reduce(
    (sum, arch) =>
      sum + arch.units.reduce((unitSum, unit) => unitSum + (unit.projects?.length ?? 0), 0),
    0,
  );
}

/** Project count for one hospital unit. */
export function countHuProjects(
  period: BudgetPeriod | null | undefined,
  huId: string | null | undefined,
): number {
  if (!period?.archetypes?.length || !huId) return 0;
  for (const arch of period.archetypes) {
    const hu = arch.units.find((u) => u.id === huId);
    if (hu) return hu.projects?.length ?? 0;
  }
  return 0;
}

export function budgetPeriodHuProjectCounts(
  period: BudgetPeriod | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!period?.archetypes?.length) return map;
  for (const arch of period.archetypes) {
    for (const unit of arch.units) {
      map.set(unit.id, unit.projects?.length ?? 0);
    }
  }
  return map;
}

/** Total nested assets attached to projects in the period tree. */
export function countBudgetPeriodNestedAssets(
  period: BudgetPeriod | null | undefined,
): number {
  if (!period?.archetypes?.length) return 0;
  let total = 0;
  for (const arch of period.archetypes) {
    for (const unit of arch.units) {
      for (const project of unit.projects ?? []) {
        total += project.assets?.length ?? 0;
      }
    }
  }
  return total;
}

/** Sum of persisted category asset counts on the period shell (from DB). */
export function countPeriodBudgetAssetCount(period: BudgetPeriod | null | undefined): number {
  if (!period?.budget) return 0;
  return Object.values(period.budget).reduce(
    (sum, row) => sum + (Number(row?.assetCount) || 0),
    0,
  );
}

/** Cache has project rows but assets were stripped (e.g. projectsOnly save). */
export function isBudgetPeriodMissingNestedAssets(
  period: BudgetPeriod | null | undefined,
): boolean {
  if (!period?.archetypes?.length) return false;
  if (countBudgetPeriodNestedAssets(period) > 0) return false;
  return countPeriodBudgetAssetCount(period) > 0;
}

function mergeProjectListPreferringAssets(
  currentProjects: Project[],
  incomingProjects: Project[],
): Project[] {
  const byId = new Map(currentProjects.map((p) => [p.id, p] as const));
  for (const incoming of incomingProjects) {
    const current = byId.get(incoming.id);
    if (!current) {
      byId.set(incoming.id, incoming);
      continue;
    }
    const currentAssets = current.assets?.length ?? 0;
    const incomingAssets = incoming.assets?.length ?? 0;
    if (incomingAssets > currentAssets) {
      byId.set(incoming.id, { ...current, ...incoming, assets: incoming.assets ?? [] });
    } else if (incomingAssets === 0 && currentAssets === 0) {
      byId.set(incoming.id, { ...current, ...incoming, assets: current.assets ?? [] });
    }
  }
  return [...byId.values()];
}

function mergeHuProjectsInPeriod(
  targetProjects: Project[],
  incomingProjects: Project[],
): Project[] {
  return mergeProjectListPreferringAssets(targetProjects, incomingProjects);
}

/**
 * Positive when `a` has more nested assets than `b` (summed across all projects).
 */
export function compareBudgetPeriodAssetRichness(
  a: BudgetPeriod | null | undefined,
  b: BudgetPeriod | null | undefined,
): number {
  return countBudgetPeriodNestedAssets(a) - countBudgetPeriodNestedAssets(b);
}

/**
 * Positive when `a` has more projects than `b` (per HU, summed).
 * Detects stale cache where only one HU was hydrated.
 */
export function compareBudgetPeriodRichness(
  a: BudgetPeriod | null | undefined,
  b: BudgetPeriod | null | undefined,
): number {
  const countsA = budgetPeriodHuProjectCounts(a);
  const countsB = budgetPeriodHuProjectCounts(b);
  const allHuIds = new Set([...countsA.keys(), ...countsB.keys()]);
  let score = 0;
  for (const huId of allHuIds) {
    score += (countsA.get(huId) ?? 0) - (countsB.get(huId) ?? 0);
  }
  return score;
}

export function isBudgetPeriodRicherThan(
  candidate: BudgetPeriod | null | undefined,
  baseline: BudgetPeriod | null | undefined,
): boolean {
  return compareBudgetPeriodRichness(candidate, baseline) > 0;
}

/** True when cache likely only contains stripped assets (incomplete hydrate). */
export function isBudgetPeriodLikelyPartial(period: BudgetPeriod | null | undefined): boolean {
  if (isBudgetPeriodMissingNestedAssets(period)) return true;
  const counts = budgetPeriodHuProjectCounts(period);
  if (counts.size === 0) return true;
  // Single-HU scoped page-bundle is intentional — do not force remount refetch.
  return false;
}

function findHuInPeriod(period: BudgetPeriod, huId: string) {
  for (const arch of period.archetypes) {
    const hu = arch.units.find((u) => u.id === huId);
    if (hu) return { archetype: arch, hu };
  }
  return null;
}

function mergeHuUnitBudgetPlans(
  targetBudget: Record<string, { budgetPlan?: number }>,
  incomingBudget: Record<string, { budgetPlan?: number }>,
): void {
  for (const [catId, raw] of Object.entries(incomingBudget)) {
    const incomingPlan = raw?.budgetPlan ?? 0;
    if (incomingPlan <= 0) continue;
    const existing = targetBudget[catId];
    const existingPlan = existing?.budgetPlan ?? 0;
    if (!existing) {
      targetBudget[catId] = JSON.parse(JSON.stringify(raw));
      continue;
    }
    if (existingPlan === 0) {
      existing.budgetPlan = incomingPlan;
    }
  }
}

/**
 * After Budget Network / Siloam save: keep the richer project/asset tree in App shell,
 * apply manual budget plan edits from the slim network payload.
 */
export function foldNetworkBudgetSaveIntoAppPeriod(
  existing: BudgetPeriod,
  saved: BudgetPeriod,
): BudgetPeriod {
  const periodName = saved.periodName.trim();
  const categoryIds = Array.from(
    new Set([...Object.keys(existing.budget ?? {}), ...Object.keys(saved.budget ?? {})]),
  );

  const merged =
    mergeRicherBudgetPeriods(periodName, existing, saved) ??
    (JSON.parse(JSON.stringify(existing)) as BudgetPeriod);
  const result = JSON.parse(JSON.stringify(merged)) as BudgetPeriod;

  for (const catId of categoryIds) {
    const savedPlan = saved.budget?.[catId]?.budgetPlan;
    if (savedPlan === undefined) continue;
    if (!result.budget[catId]) {
      result.budget[catId] = {
        budgetPlan: 0,
        budgetCarryForward: 0,
        budgetAllocated: 0,
        approvedBudget: 0,
        consumedBudget: 0,
      };
    }
    result.budget[catId].budgetPlan = savedPlan;
  }

  for (const savedArch of saved.archetypes) {
    const targetArch = result.archetypes.find((a) => a.id === savedArch.id);
    if (!targetArch) continue;
    for (const catId of categoryIds) {
      const savedPlan = savedArch.budget?.[catId]?.budgetPlan;
      if (savedPlan === undefined) continue;
      if (!targetArch.budget[catId]) {
        targetArch.budget[catId] = {
          budgetPlan: 0,
          budgetCarryForward: 0,
          budgetAllocated: 0,
          approvedBudget: 0,
          consumedBudget: 0,
        };
      }
      targetArch.budget[catId].budgetPlan = savedPlan;
    }
    for (const savedHu of savedArch.units) {
      const targetHu = targetArch.units.find((u) => u.id === savedHu.id);
      if (!targetHu) continue;
      for (const catId of categoryIds) {
        const savedPlan = savedHu.budget?.[catId]?.budgetPlan;
        if (savedPlan === undefined) continue;
        if (!targetHu.budget[catId]) {
          targetHu.budget[catId] = {
            budgetPlan: 0,
            budgetCarryForward: 0,
            budgetAllocated: 0,
            approvedBudget: 0,
            consumedBudget: 0,
          };
        }
        targetHu.budget[catId].budgetPlan = savedPlan;
      }
    }
  }

  return result;
}

/** Merge periods — per HU keep whichever source has more projects. Also union missing HUs. */
export function mergeRicherBudgetPeriods(
  periodName: string,
  ...sources: (BudgetPeriod | null | undefined)[]
): BudgetPeriod | null {
  const valid = sources.filter(
    (period): period is BudgetPeriod =>
      !!period &&
      period.periodName === periodName.trim() &&
      !isAppBudgetPeriodStructureShell(period, periodName),
  );
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0];

  let base = valid[0];
  for (let i = 1; i < valid.length; i += 1) {
    const projectGain = compareBudgetPeriodRichness(valid[i], base);
    const assetGain = compareBudgetPeriodAssetRichness(valid[i], base);
    if (projectGain > 0 || (projectGain === 0 && assetGain > 0)) {
      base = valid[i];
    }
  }

  const merged: BudgetPeriod = JSON.parse(JSON.stringify(base)) as BudgetPeriod;

  // Ensure every HU/archetype from any source exists on the merged tree (dropdown completeness).
  for (const source of valid) {
    if (source === base) continue;
    mergeBudgetPeriodMasterStructureInPlace(merged, source.archetypes);
  }

  for (const source of valid) {
    if (source === base) continue;
    for (const arch of source.archetypes) {
      for (const unit of arch.units) {
        const target = findHuInPeriod(merged, unit.id);
        if (!target) continue;
        const incomingCount = unit.projects?.length ?? 0;
        const currentCount = target.hu.projects?.length ?? 0;
        if (incomingCount > currentCount) {
          target.hu.projects = JSON.parse(JSON.stringify(unit.projects ?? []));
          if (unit.budget && Object.keys(unit.budget).length > 0) {
            target.hu.budget = JSON.parse(JSON.stringify(unit.budget));
          }
        } else if (incomingCount === currentCount && incomingCount > 0) {
          target.hu.projects = mergeHuProjectsInPeriod(
            target.hu.projects ?? [],
            unit.projects ?? [],
          );
        }
        if (unit.budget && Object.keys(unit.budget).length > 0) {
          if (!target.hu.budget) target.hu.budget = {};
          mergeHuUnitBudgetPlans(target.hu.budget, unit.budget);
        }
      }
    }
  }

  return merged;
}

/**
 * Ensure master HU / archetype rows exist on a BudgetPeriod tree without dropping projects.
 * Used so the Budget HU header dropdown stays complete (e.g. SHSS) even when disk cache
 * or a page save only hydrated a subset of units.
 */
function mergeBudgetPeriodMasterStructureInPlace(
  period: BudgetPeriod,
  structureArchetypes: Archetype[],
): void {
  const archById = new Map(period.archetypes.map((a) => [String(a.id), a] as const));
  const unitHome = new Map<string, string>();
  for (const arch of structureArchetypes) {
    for (const unit of arch.units ?? []) {
      unitHome.set(String(unit.id), String(arch.id));
    }
  }

  for (const structArch of structureArchetypes) {
    const archId = String(structArch.id);
    let arch = archById.get(archId);
    if (!arch) {
      arch = {
        id: structArch.id,
        name: structArch.name,
        budget: {},
        units: [],
      };
      period.archetypes.push(arch);
      archById.set(archId, arch);
    } else if (structArch.name) {
      arch.name = structArch.name;
    }

    const unitById = new Map(arch.units.map((u) => [String(u.id), u] as const));
    for (const structUnit of structArch.units ?? []) {
      const unitId = String(structUnit.id);
      const existing = unitById.get(unitId);
      if (!existing) {
        const unit: HospitalUnit = {
          id: structUnit.id,
          name: structUnit.name,
          code: structUnit.code,
          isPipeline: Boolean(structUnit.isPipeline),
          budget: {},
          projects: [],
        };
        arch.units.push(unit);
        unitById.set(unitId, unit);
      } else {
        existing.name = structUnit.name || existing.name;
        if (structUnit.code != null && String(structUnit.code).trim()) {
          existing.code = structUnit.code;
        }
        if (typeof structUnit.isPipeline === 'boolean') {
          existing.isPipeline = structUnit.isPipeline;
        }
      }
    }
  }

  // Relocate units whose master archetype_id moved (e.g. HU reassigned in Configuration).
  const orphans: HospitalUnit[] = [];
  for (const arch of period.archetypes) {
    const keep: HospitalUnit[] = [];
    for (const unit of arch.units) {
      const home = unitHome.get(String(unit.id));
      if (home != null && home !== String(arch.id)) {
        orphans.push(unit);
      } else {
        keep.push(unit);
      }
    }
    arch.units = keep;
  }
  for (const unit of orphans) {
    const home = unitHome.get(String(unit.id));
    if (!home) continue;
    const arch = archById.get(home);
    if (!arch) continue;
    if (!arch.units.some((u) => String(u.id) === String(unit.id))) {
      arch.units.push(unit);
    }
  }

  for (const arch of period.archetypes) {
    arch.units.sort((a, b) =>
      String(a.code || a.name).localeCompare(String(b.code || b.name), 'id', {
        numeric: true,
        sensitivity: 'base',
      }),
    );
  }
}

export function mergeBudgetPeriodMasterStructure(
  existing: BudgetPeriod | null | undefined,
  structureArchetypes: Archetype[],
  periodName: string,
): BudgetPeriod {
  const pn = periodName.trim();
  const period: BudgetPeriod =
    existing && existing.periodName === pn
      ? (JSON.parse(JSON.stringify(existing)) as BudgetPeriod)
      : {
          periodName: pn,
          multiYearName: existing?.multiYearName ?? '',
          startDate: existing?.startDate ?? '',
          endDate: existing?.endDate ?? '',
          budget: existing?.budget ? JSON.parse(JSON.stringify(existing.budget)) : {},
          archetypes: [],
        };

  mergeBudgetPeriodMasterStructureInPlace(period, structureArchetypes);
  return period;
}

/** Tables whose Realtime events should refresh App-shell HU/archetype dropdown structure. */
export const BUDGET_HU_SHELL_STRUCTURE_TABLES = new Set<string>([
  'hospital_units_config',
  'archetypes_config',
  'budget_periods',
  'budget_period_hospital_unit_budgets',
  'budget_period_archetype_budgets',
]);

function pickRicherBudgetPeriod(
  periodName: string,
  ...candidates: (BudgetPeriod | null | undefined)[]
): BudgetPeriod | null {
  const key = periodName.trim();
  let best: BudgetPeriod | null = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    if (!candidate || candidate.periodName !== key) continue;
    if (isAppBudgetPeriodStructureShell(candidate, periodName)) continue;
    const score = compareBudgetPeriodRichness(candidate, best);
    const absolute = countBudgetPeriodProjects(candidate);
    if (!best || score > 0 || (score === 0 && absolute > bestScore)) {
      best = candidate;
      bestScore = absolute;
    }
  }
  return best;
}

function pickRicherPageBundle(
  periodName: string,
  ...candidates: (BudgetHuPageBundle | null | undefined)[]
): BudgetHuPageBundle | null {
  let best: BudgetHuPageBundle | null = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    if (!candidate?.budgetPeriod) continue;
    if (isAppBudgetPeriodStructureShell(candidate.budgetPeriod, periodName)) continue;
    const score = compareBudgetPeriodRichness(
      candidate.budgetPeriod,
      best?.budgetPeriod ?? null,
    );
    const absolute = countBudgetPeriodProjects(candidate.budgetPeriod);
    if (!best || score > 0 || (score === 0 && absolute > bestScore)) {
      best = candidate;
      bestScore = absolute;
    }
  }
  return best;
}

export function readBudgetPeriodCache(periodName: string, userId: number): BudgetPeriod | null {
  const env = readFromStorages<BudgetPeriod>(periodKey(periodName, userId));
  if (!env || !isFresh(env.savedAt, PERIOD_TTL_MS)) return null;
  return env.payload;
}

/** Instant paint on F5 — may be slightly stale until background revalidate. */
export function readBudgetPeriodCacheAnyAge(periodName: string, userId: number): BudgetPeriod | null {
  const env = readFromStorages<BudgetPeriod>(periodKey(periodName, userId));
  return env?.payload ?? null;
}

export function writeBudgetPeriodCache(
  periodName: string,
  userId: number,
  period: BudgetPeriod,
  options?: { replace?: boolean },
): void {
  if (!periodName.trim() || !Number.isFinite(userId)) return;
  if (options?.replace) {
    writeToStorages(periodKey(periodName, userId), period);
    return;
  }
  const existing = readBudgetPeriodCacheAnyAge(periodName, userId);
  const merged = mergeRicherBudgetPeriods(periodName, existing, period);
  if (!merged) return;
  if (
    existing &&
    !isAppBudgetPeriodStructureShell(existing, periodName) &&
    compareBudgetPeriodRichness(merged, existing) <= 0
  ) {
    return;
  }
  writeToStorages(periodKey(periodName, userId), merged);
}

export function readBudgetHuConfigCache(userId: number): BudgetHuConfigBundle | null {
  const env = readFromStorages<BudgetHuConfigBundle>(configKey(userId));
  if (!env || !isFresh(env.savedAt, CONFIG_TTL_MS)) return null;
  return env.payload;
}

export function readBudgetHuConfigCacheAnyAge(userId: number): BudgetHuConfigBundle | null {
  const env = readFromStorages<BudgetHuConfigBundle>(configKey(userId));
  return env?.payload ?? null;
}

export function writeBudgetHuConfigCache(userId: number, config: BudgetHuConfigBundle): void {
  if (!Number.isFinite(userId)) return;
  writeToStorages(configKey(userId), config);
}

export function readBudgetHuPageCache(periodName: string, userId: number): BudgetHuPageBundle | null {
  const env = readFromStorages<BudgetHuPageBundle>(pageKey(periodName, userId));
  if (!env || !isFresh(env.savedAt, PAGE_TTL_MS)) return null;
  return env.payload;
}

export function readBudgetHuPageCacheAnyAge(periodName: string, userId: number): BudgetHuPageBundle | null {
  const env = readFromStorages<BudgetHuPageBundle>(pageKey(periodName, userId));
  return env?.payload ?? null;
}

export function writeBudgetHuPageCache(
  periodName: string,
  userId: number,
  bundle: BudgetHuPageBundle,
  options?: { replace?: boolean },
): void {
  if (!periodName.trim() || !Number.isFinite(userId)) return;
  if (options?.replace) {
    writeToStorages(pageKey(periodName, userId), bundle);
    return;
  }
  const existing = readBudgetHuPageCacheAnyAge(periodName, userId);
  if (
    existing?.budgetPeriod &&
    !isAppBudgetPeriodStructureShell(existing.budgetPeriod, periodName) &&
    !isBudgetPeriodRicherThan(bundle.budgetPeriod, existing.budgetPeriod)
  ) {
    return;
  }
  const mergedPeriod = mergeRicherBudgetPeriods(periodName, existing?.budgetPeriod, bundle.budgetPeriod);
  writeToStorages(pageKey(periodName, userId), {
    ...bundle,
    budgetPeriod: mergedPeriod ?? bundle.budgetPeriod,
  });
}

export function invalidateBudgetHuConfigDiskCache(userId: number): void {
  if (typeof window === 'undefined' || !Number.isFinite(userId)) return;
  const key = configKey(userId);
  try {
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

export function invalidateBudgetHuDiskCache(periodName: string, userId: number): void {
  if (typeof window === 'undefined') return;
  for (const key of [
    periodKey(periodName, userId),
    pageKey(periodName, userId),
    configKey(userId),
  ]) {
    try {
      window.sessionStorage.removeItem(key);
      window.localStorage.removeItem(key);
    } catch {
      /* noop */
    }
  }
}

/** Sync read for App boot — full period tree, not structure shell. */
export function readInitialBudgetPeriodForShell(): BudgetPeriod | null {
  if (typeof window === 'undefined') return null;
  const shell = readPeriodShellCache();
  const user = readCachedAuthUser();
  if (!shell?.selectedPeriodName || !user?.id) return null;
  const cached = readBudgetPeriodCacheAnyAge(shell.selectedPeriodName, user.id);
  if (!cached || isAppBudgetPeriodStructureShell(cached, shell.selectedPeriodName)) return null;
  return cached;
}

export function hasFullBudgetPeriodOnDisk(periodName: string, userId: number): boolean {
  const cached = readBudgetPeriodCacheAnyAge(periodName, userId);
  return !!cached && !isAppBudgetPeriodStructureShell(cached, periodName);
}

export function hasBudgetHuPageOnDisk(periodName: string, userId: number): boolean {
  if (hasFullBudgetPeriodOnDisk(periodName, userId)) return true;
  const page = readBudgetHuPageCacheAnyAge(periodName, userId);
  return (
    !!page?.budgetPeriod &&
    !isAppBudgetPeriodStructureShell(page.budgetPeriod, periodName)
  );
}

/**
 * Sync read for App / page initializer — page bundle first, then period + config disk.
 * Membuat paint pertama berisi data HU (tanpa menunggu useLayoutEffect).
 */
export function resolveBudgetHuPageForDisplay(
  periodName: string,
  userId: number,
  currentBudgetPeriod?: BudgetPeriod | null,
  preloaded?: BudgetHuPageBundle | null,
): BudgetHuPageBundle | null {
  if (!periodName.trim() || !Number.isFinite(userId)) {
    return preloaded?.budgetPeriod &&
      !isAppBudgetPeriodStructureShell(preloaded.budgetPeriod, periodName)
      ? preloaded
      : null;
  }
  if (typeof window === 'undefined') {
    return preloaded?.budgetPeriod &&
      !isAppBudgetPeriodStructureShell(preloaded.budgetPeriod, periodName)
      ? preloaded
      : null;
  }

  const pageFresh = readBudgetHuPageCache(periodName, userId);
  const pageAny = readBudgetHuPageCacheAnyAge(periodName, userId);
  const periodFromTree = resolveFullBudgetPeriodForDisplay(periodName, userId, currentBudgetPeriod);
  const config = readBudgetHuConfigCacheAnyAge(userId);

  const composedFromPeriod: BudgetHuPageBundle | null = periodFromTree
    ? {
        budgetPeriod: periodFromTree,
        routineAssetMaxBudget: config?.routineAssetMaxBudget ?? 0,
        categories: config?.categories ?? [],
        priorities: config?.priorities ?? [],
        workflows: config?.workflows ?? [],
        assetTypes: config?.assetTypes ?? [],
        studies: pageAny?.studies ?? pageFresh?.studies ?? [],
      }
    : null;

  const bestBundle = pickRicherPageBundle(
    periodName,
    preloaded,
    pageFresh,
    pageAny,
    composedFromPeriod,
  );
  if (!bestBundle) return null;

  const mergedPeriod = mergeRicherBudgetPeriods(
    periodName,
    preloaded?.budgetPeriod,
    pageFresh?.budgetPeriod,
    pageAny?.budgetPeriod,
    composedFromPeriod?.budgetPeriod,
    currentBudgetPeriod?.periodName === periodName.trim() ? currentBudgetPeriod : null,
  );

  return {
    ...bestBundle,
    budgetPeriod: mergedPeriod ?? bestBundle.budgetPeriod,
  };
}

/** Sync read for App boot — full HU page bundle when period shell is known. */
export function readInitialBudgetHuPageForShell(): BudgetHuPageBundle | null {
  if (typeof window === 'undefined') return null;
  const shell = readPeriodShellCache();
  const user = readCachedAuthUser();
  if (!shell?.selectedPeriodName || !user?.id) return null;
  return resolveBudgetHuPageForDisplay(shell.selectedPeriodName, user.id, null, null);
}

/**
 * Sumber terbaik untuk paint pertama (sync) — abaikan shell App jika disk punya pohon lengkap.
 */
export function resolveFullBudgetPeriodForDisplay(
  periodName: string,
  userId: number,
  currentBudgetPeriod?: BudgetPeriod | null,
): BudgetPeriod | null {
  if (!periodName.trim() || !Number.isFinite(userId)) return null;

  const fromApp =
    currentBudgetPeriod?.periodName === periodName.trim() ? currentBudgetPeriod : null;

  if (typeof window === 'undefined') {
    return mergeRicherBudgetPeriods(periodName, fromApp) ?? pickRicherBudgetPeriod(periodName, fromApp);
  }

  const fromDisk = readBudgetPeriodCacheAnyAge(periodName, userId);
  const fromPage = readBudgetHuPageCacheAnyAge(periodName, userId)?.budgetPeriod ?? null;

  return pickRicherBudgetPeriod(
    periodName,
    mergeRicherBudgetPeriods(periodName, fromApp, fromDisk, fromPage),
    fromApp,
    fromDisk,
    fromPage,
  );
}

const FILTER_KEY = 'capex.budgetHu.filters.v1';

export type BudgetHuFilterSelection = {
  periodName: string;
  archetypeId: string;
  huId: string;
  /** Optional stable code (e.g. SHSS) — used when id lookup fails across cache rebuilds. */
  huCode?: string;
};

export function readBudgetHuFilterSelection(periodName: string): BudgetHuFilterSelection | null {
  if (typeof window === 'undefined' || !periodName.trim()) return null;
  try {
    const raw = window.localStorage.getItem(FILTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BudgetHuFilterSelection;
    if (parsed?.periodName !== periodName.trim()) return null;
    if (!parsed.archetypeId || !parsed.huId) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Last written filter regardless of period — used only as last-resort recover. */
export function readLastBudgetHuFilterSelection(): BudgetHuFilterSelection | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(FILTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BudgetHuFilterSelection;
    if (!parsed?.archetypeId || !parsed?.huId || !parsed?.periodName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeBudgetHuFilterSelection(
  periodName: string,
  archetypeId: string | null,
  huId: string | null,
  huCode?: string | null,
): void {
  if (typeof window === 'undefined' || !periodName.trim() || !archetypeId || !huId) return;
  try {
    const payload: BudgetHuFilterSelection = {
      periodName: periodName.trim(),
      archetypeId,
      huId,
    };
    const code = String(huCode ?? '').trim();
    if (code) payload.huCode = code;
    window.localStorage.setItem(FILTER_KEY, JSON.stringify(payload));
  } catch {
    /* noop */
  }
}

/** Clear pinned HU filter (e.g. after user switches archetype before a new HU is chosen). */
export function clearBudgetHuFilterSelection(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(FILTER_KEY);
  } catch {
    /* noop */
  }
}

/** Locate a HU anywhere in the period tree by id or code. */
export function findHuInBudgetPeriod(
  period: BudgetPeriod | null | undefined,
  huId?: string | null,
  huCode?: string | null,
): { archetypeId: string; huId: string; huCode: string } | null {
  if (!period?.archetypes?.length) return null;
  const wantId = String(huId ?? '').trim();
  const wantCode = String(huCode ?? '').trim().toUpperCase();
  for (const arch of period.archetypes) {
    for (const unit of arch.units ?? []) {
      if (wantId && String(unit.id) === wantId) {
        return {
          archetypeId: String(arch.id),
          huId: String(unit.id),
          huCode: String(unit.code ?? ''),
        };
      }
    }
  }
  if (wantCode) {
    for (const arch of period.archetypes) {
      for (const unit of arch.units ?? []) {
        if (String(unit.code ?? '').trim().toUpperCase() === wantCode) {
          return {
            archetypeId: String(arch.id),
            huId: String(unit.id),
            huCode: String(unit.code ?? ''),
          };
        }
      }
    }
  }
  return null;
}
