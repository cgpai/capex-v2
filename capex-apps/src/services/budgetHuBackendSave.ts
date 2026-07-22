import type { BudgetPeriod, HospitalUnit } from '../types';
import { useBackendSession } from '../lib/auth/authConstants';
import { isCapexBeConfigured } from '../lib/capexBeClient';
import { saveBudgetHuViaBackend } from './capexCrudApi';
import {
  buildBudgetHuPartialSavePeriod,
  collectBudgetHuSaveChanges,
} from '../screens/BudgetHU/budgetHuSaveHelpers';

export type BudgetHuBackendPersistOptions = {
  huId?: string;
  archetypeId?: string | null;
  changedProjectIds?: string[];
  deletedProjectIds?: string[];
  touchedAssetIds?: string[];
};

function findHu(period: BudgetPeriod | null | undefined, huId: string): HospitalUnit | null {
  if (!period) return null;
  return period.archetypes.flatMap((a) => a.units).find((u) => u.id === huId) ?? null;
}

function collectChangedHuIds(original: BudgetPeriod | null, updated: BudgetPeriod): string[] {
  const ids = new Set<string>();
  for (const arch of updated.archetypes) {
    for (const unit of arch.units) {
      const diff = collectBudgetHuSaveChanges(findHu(original, unit.id), unit);
      if (diff.changedProjectIds.size > 0) ids.add(unit.id);
    }
  }
  return Array.from(ids);
}

/**
 * Persist HU budget changes via capexbe (service role) — avoids frontend Supabase RLS.
 */
export async function persistBudgetHuChangesViaBackend(
  userId: number,
  updatedPeriod: BudgetPeriod,
  originalPeriod: BudgetPeriod | null | undefined,
  options?: BudgetHuBackendPersistOptions,
): Promise<BudgetPeriod | null> {
  if (!useBackendSession() || !isCapexBeConfigured()) return null;

  const huIds = options?.huId ? [options.huId] : collectChangedHuIds(originalPeriod ?? null, updatedPeriod);
  if (huIds.length === 0) return null;

  let lastSaved: BudgetPeriod | null = null;

  for (const huId of huIds) {
    const originalHU = findHu(originalPeriod ?? null, huId);
    const editedHU = findHu(updatedPeriod, huId);
    if (!editedHU) continue;

    const diff = collectBudgetHuSaveChanges(originalHU, editedHU);
    for (const id of options?.changedProjectIds ?? []) diff.changedProjectIds.add(id);
    for (const id of options?.deletedProjectIds ?? []) diff.deletedProjectIds.add(id);
    for (const id of options?.touchedAssetIds ?? []) diff.touchedAssetIds.add(id);

    if (diff.changedProjectIds.size === 0) continue;

    const partial = buildBudgetHuPartialSavePeriod(
      updatedPeriod,
      huId,
      options?.archetypeId ?? null,
      diff.changedProjectIds,
      diff.deletedProjectIds,
    );

    const touchedAssetIdList = Array.from(diff.touchedAssetIds);
    lastSaved = await saveBudgetHuViaBackend(userId, updatedPeriod.periodName, partial, {
      huId,
      changedProjectIds: Array.from(diff.changedProjectIds),
      deletedProjectIds: Array.from(diff.deletedProjectIds),
      touchedAssetIds: touchedAssetIdList,
      partial: true,
      projectsOnly: touchedAssetIdList.length === 0,
    });

    if (!lastSaved) return null;
  }

  return lastSaved;
}
