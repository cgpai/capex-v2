import type { EnrichedAsset } from '../types';

/** True when asset lifecycle / status marks it as cancelled (hidden from Capex project list). */
export function isAssetCancelledForProjectList(asset: EnrichedAsset | { lifecycleStatus?: string | null }): boolean {
    const raw = asset.lifecycleStatus?.trim().toLowerCase();
    if (!raw) return false;
    return raw === 'cancel' || raw === 'cancelled' || raw === 'canceled';
}
