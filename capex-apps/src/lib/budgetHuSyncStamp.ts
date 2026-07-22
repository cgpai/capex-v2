/** Persist last known HU sync fingerprint so reopen skips redundant page-bundle fetch. */

function stampStorageKey(userId: number, periodName: string, huId: string): string {
  return `capex.budgetHu.syncStamp.v1:${userId}:${periodName.trim().toLowerCase()}:${huId.trim()}`;
}

export function readStoredHuSyncFingerprint(
  userId: number,
  periodName: string,
  huId: string,
): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(stampStorageKey(userId, periodName, huId))?.trim() || '';
  } catch {
    return '';
  }
}

export function writeStoredHuSyncFingerprint(
  userId: number,
  periodName: string,
  huId: string,
  fingerprint: string,
): void {
  if (typeof window === 'undefined' || !fingerprint.trim()) return;
  try {
    window.sessionStorage.setItem(stampStorageKey(userId, periodName, huId), fingerprint.trim());
  } catch {
    /* quota / private mode */
  }
}

/** Sorted `id:code` for one HU — compare to server `projectSignature` without full refetch. */
export function localHuProjectSignature(
  period: {
    archetypes?: Array<{
      units?: Array<{
        id?: string;
        projects?: Array<{ id?: string; projectCode?: string }>;
      }>;
    }>;
  } | null | undefined,
  hospitalUnitId: string,
): string {
  if (!period || !hospitalUnitId.trim()) return '';
  const parts: string[] = [];
  for (const arch of period.archetypes ?? []) {
    for (const unit of arch.units ?? []) {
      if (String(unit.id) !== hospitalUnitId) continue;
      for (const project of unit.projects ?? []) {
        const id = String(project.id ?? '').trim();
        if (!id) continue;
        parts.push(`${id}:${String(project.projectCode ?? '').trim()}`);
      }
    }
  }
  parts.sort();
  return parts.join(',');
}
