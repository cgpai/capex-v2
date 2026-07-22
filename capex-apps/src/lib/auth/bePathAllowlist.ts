/**
 * Explicit allowlist for BFF → capexbe proxy paths.
 * Rejects open-proxy probing of unmapped backend routes.
 */
const ALLOWED_PATH_PREFIXES = [
  'audit/',
  'notifications/',
  'budget-hu/',
  'budget-multi-year/',
  'task-actions/',
  'configuration/',
  'user-admin/',
  'smart-migration/',
  'project-list',
  'project-list/',
  'po-update/',
  'my-tasks',
  'my-tasks/',
  'monitoring/',
  'mom-daily-summary/',
  'gr-update/',
  'fs/',
  'fs-update/',
  'fs-realization/',
  'fs-approval/',
  'executive-summary/',
  'duplicate-detection/',
  'dashboard/',
  'bootstrap',
  'asset-timeline',
  // backup/, ai-analytics/, bdd-construction/ — add when capexbe controllers exist
] as const;

function normalizeBePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '').trim();
}

/** Reject traversal / encoded dots before prefix matching. */
export function isAllowedBePath(path: string): boolean {
  const normalized = normalizeBePath(path);
  if (!normalized) return false;
  if (normalized.includes('..') || normalized.includes('\\')) return false;

  let decoded = normalized;
  try {
    decoded = decodeURIComponent(normalized);
  } catch {
    return false;
  }
  if (decoded.includes('..') || decoded.includes('\\')) return false;

  return ALLOWED_PATH_PREFIXES.some((prefix) => {
    const base = prefix.replace(/\/+$/, '');
    if (normalized === base) return true;
    return normalized.startsWith(`${base}/`);
  });
}
