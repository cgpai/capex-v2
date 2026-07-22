/**
 * Stable Map/Record key for asset ids. PostgREST can return UUIDs with different casing
 * across `assets`, `asset_task_statuses`, and `task_logs` — must match capexbe `canonicalAssetKey`.
 */
export function normAssetKey(id: string | number | undefined | null): string {
  if (id == null || id === '') return '';
  return String(id).trim().toLowerCase();
}
