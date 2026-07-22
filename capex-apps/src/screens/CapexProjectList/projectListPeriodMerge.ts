import type { EnrichedAsset, Project } from '../../types';
import type { ProjectListSortOption } from '../../services/projectListQueryTypes';
import { compareAssetCodes } from './listUtils';

export type PeriodAssetStreamState = {
  periodName: string;
  total: number;
  buffer: EnrichedAsset[];
  /** Projects loaded alongside streamed asset chunks (for multi-period merge). */
  projectsById: Map<string, Project>;
  page: number;
  exhausted: boolean;
};

export function compareAssetsForProjectListSort(
  a: EnrichedAsset,
  b: EnrichedAsset,
  sortBy: ProjectListSortOption,
): number {
  const cmp = compareAssetCodes(a.assetCode, b.assetCode);
  return sortBy === 'assetCode_desc' ? -cmp : cmp;
}

/** Pick the stream head with the smallest asset code (global sort across periods). */
export function pickLeadingStreamIndex(
  streams: PeriodAssetStreamState[],
  sortBy: ProjectListSortOption,
): number {
  let bestIdx = -1;
  let best: EnrichedAsset | null = null;
  for (let i = 0; i < streams.length; i++) {
    const head = streams[i].buffer[0];
    if (!head) continue;
    if (!best || compareAssetsForProjectListSort(head, best, sortBy) < 0) {
      best = head;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * K-way merge of per-period sorted asset streams into one paginated page.
 * Pure helper for unit tests — async refill is injected by caller.
 */
export function sliceMergedPeriodPage(
  streams: PeriodAssetStreamState[],
  sortBy: ProjectListSortOption,
  page: number,
  pageSize: number,
): { pageAssets: EnrichedAsset[]; skipped: number; exhausted: boolean } {
  const globalOffset = Math.max(0, (page - 1) * pageSize);
  let skipped = 0;
  const pageAssets: EnrichedAsset[] = [];

  while (pageAssets.length < pageSize) {
    const bestIdx = pickLeadingStreamIndex(streams, sortBy);
    if (bestIdx < 0) {
      return { pageAssets, skipped, exhausted: true };
    }
    const asset = streams[bestIdx].buffer.shift()!;
    if (skipped < globalOffset) {
      skipped += 1;
      continue;
    }
    pageAssets.push(asset);
  }

  return { pageAssets, skipped, exhausted: false };
}
