import type { Asset } from '../types';

const ASSET_SEQ_PAD = 3;
const ROUTINE_PROJECT_SEGMENT = 'RA';
const ROUTINE_ASSET_SEGMENT = '00';

/**
 * Project routine: `SHLV.26.RA` → asset codes use `SHLV.26.00.{nnn}` (bukan `SHLV.26.RA.{nnn}`).
 * Strategic / lainnya: `{projectCode}.{nnn}`.
 */
export function resolveAssetCodePrefix(projectCode: string): string {
  const code = String(projectCode ?? '').trim();
  const parts = code.split('.');
  if (parts.length >= 3 && parts[2].toUpperCase() === ROUTINE_PROJECT_SEGMENT) {
    return `${parts[0]}.${parts[1]}.${ROUTINE_ASSET_SEGMENT}`;
  }
  return code;
}

/** Prefixes to scan when resolving max sequence (primary + legacy routine `.RA.`). */
function assetCodePrefixesForProject(projectCode: string): string[] {
  const code = String(projectCode ?? '').trim();
  const primary = resolveAssetCodePrefix(code);
  const prefixes = [primary];
  if (primary !== code) {
    prefixes.push(code);
  }
  return prefixes;
}

/** Parse trailing numeric segment after `{prefix}.` */
export function parseAssetSequenceNumber(assetCode: string, prefix: string): number | null {
  const normalizedPrefix = `${prefix}.`;
  const code = String(assetCode ?? '').trim();
  if (!code.startsWith(normalizedPrefix)) return null;
  const suffix = code.slice(normalizedPrefix.length);
  if (!/^\d+$/.test(suffix)) return null;
  const n = parseInt(suffix, 10);
  return Number.isFinite(n) ? n : null;
}

export function maxAssetSequenceForProject(
  projectCode: string,
  assets: readonly { assetCode?: string }[],
): number {
  const prefixes = assetCodePrefixesForProject(projectCode);
  let max = 0;
  for (const a of assets) {
    const assetCode = String(a.assetCode ?? '');
    for (const prefix of prefixes) {
      const n = parseAssetSequenceNumber(assetCode, prefix);
      if (n != null && n > max) max = n;
    }
  }
  return max;
}

function collectUsedAssetCodes(
  assets: readonly { assetCode?: string }[],
  extra?: ReadonlySet<string>,
): Set<string> {
  const used = new Set<string>();
  for (const a of assets) {
    const c = String(a.assetCode ?? '').trim().toUpperCase();
    if (c) used.add(c);
  }
  if (extra) {
    for (const c of extra) {
      const v = String(c).trim().toUpperCase();
      if (v) used.add(v);
    }
  }
  return used;
}

/** Next unique asset code (e.g. routine `SHLV.26.00.001`, strategic `SHLV.26.03.001`). */
export function nextAssetCode(
  projectCode: string,
  assets: readonly { assetCode?: string }[],
  extraReserved?: ReadonlySet<string>,
): string {
  const prefix = resolveAssetCodePrefix(projectCode);
  const used = collectUsedAssetCodes(assets, extraReserved);
  let n = maxAssetSequenceForProject(projectCode, assets) + 1;
  const maxTry = Math.max(10_000, assets.length + 500);
  while (n <= maxTry) {
    const candidate = `${prefix}.${String(n).padStart(ASSET_SEQ_PAD, '0')}`;
    if (!used.has(candidate.toUpperCase())) return candidate;
    n += 1;
  }
  throw new Error(`Cannot allocate unique asset code for project ${projectCode}`);
}

export function newAssetId(projectCode: string): string {
  return `ASSET-${projectCode}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export type AssetDefaults = {
  budgetCategoryId: string;
  workflowSetId: string;
};

/** Ensure every asset has id, unique assetCode, and required defaults (routine / spreadsheet rows). */
export function normalizeProjectAssets(
  projectCode: string,
  assets: Asset[],
  defaults: AssetDefaults,
): Asset[] {
  const normalized: Asset[] = [];
  const usedCodes = new Set<string>();

  for (const raw of assets) {
    const asset: Asset = { ...raw };
    if (!String(asset.id ?? '').trim()) {
      asset.id = newAssetId(projectCode);
    }
    const code = String(asset.assetCode ?? '').trim();
    const prefix = resolveAssetCodePrefix(projectCode);
    const validPrefix =
      code.startsWith(`${prefix}.`) ||
      (prefix !== projectCode && code.startsWith(`${projectCode}.`));
    if (!code || !validPrefix || usedCodes.has(code.toUpperCase())) {
      asset.assetCode = nextAssetCode(projectCode, normalized, usedCodes);
    }
    usedCodes.add(asset.assetCode.toUpperCase());
    if (!asset.budgetCategoryId) asset.budgetCategoryId = defaults.budgetCategoryId;
    if (!asset.workflowSetId) asset.workflowSetId = defaults.workflowSetId;
    if (asset.budgetAllocated == null) asset.budgetAllocated = 0;
    if (asset.consumedBudget == null) asset.consumedBudget = 0;
    if (asset.qty == null) asset.qty = 1;
    if (asset.receivedQty == null) asset.receivedQty = 0;
    normalized.push(asset);
  }
  return normalized;
}
