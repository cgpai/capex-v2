import { fetchCapexProjectListQuery } from '@/hooks/queries/fetchCapexProjectListQuery';
import { fetchCapexProjectListMaster } from '@/hooks/queries/fetchCapexProjectListMaster';
import { attachMasterToBundle, type ProjectListBundle } from '@/services/capexProjectListApi';
import type { ProjectListQueryParams } from '@/services/projectListQueryTypes';
import { normAssetKey } from '@/lib/assetKeys';
import type { EnrichedAsset, Project } from '@/types';

/** Chunk size for background pool warm (matches BE table cap). */
const POOL_PAGE_SIZE = 500;
/** Parallel in-flight chunk requests — keep low to avoid starving first-page load. */
const POOL_PARALLEL = 2;

export function isCompleteProjectListBundle(bundle: ProjectListBundle): boolean {
  const total = bundle.totalAssetCount;
  if (typeof total !== 'number' || total <= 0) return bundle.enrichedAssets.length > 0;
  return bundle.enrichedAssets.length >= total;
}

function mergePoolChunks(
  chunks: ProjectListBundle[],
  master?: ProjectListBundle,
): {
  enrichedAssets: EnrichedAsset[];
  projects: Project[];
  assetLastTaskMap: Record<string, string>;
  meta: ProjectListBundle;
} {
  const meta = master ?? chunks[0];
  const projectsById = new Map<string, Project>();
  const lastMap: Record<string, string> = {};
  const assets: EnrichedAsset[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    for (const asset of chunk.enrichedAssets) {
      const key = normAssetKey(asset.id);
      if (seen.has(key)) continue;
      seen.add(key);
      assets.push(asset);
    }
    for (const p of chunk.projects) {
      projectsById.set(String(p.id), p);
    }
    Object.entries(chunk.assetLastTaskMap).forEach(([k, v]) => {
      lastMap[normAssetKey(k)] = v;
    });
  }

  return {
    enrichedAssets: assets,
    projects: Array.from(projectsById.values()),
    assetLastTaskMap: lastMap,
    meta,
  };
}

/**
 * Background warm for client-side filters — uses cached paginated queries (not exportAll).
 * Run deferred (idle) so first table page is not starved.
 */
export async function warmProjectListClientPool(
  baseParams: Omit<ProjectListQueryParams, 'page' | 'pageSize'>,
  accessToken?: string | null,
  signal?: AbortSignal,
): Promise<{
  enrichedAssets: EnrichedAsset[];
  projects: Project[];
  assetLastTaskMap: Record<string, string>;
  meta: ProjectListBundle;
}> {
  const [head, master] = await Promise.all([
    fetchCapexProjectListQuery(
      {
        ...baseParams,
        page: 1,
        pageSize: POOL_PAGE_SIZE,
        skipCache: baseParams.skipCache ?? false,
      },
      accessToken,
    ),
    fetchCapexProjectListMaster(baseParams.userId, accessToken),
  ]);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const headWithMaster = attachMasterToBundle(head, master);

  const total =
    typeof headWithMaster.totalAssetCount === 'number'
      ? headWithMaster.totalAssetCount
      : headWithMaster.enrichedAssets.length;
  if (total <= 0) {
    return {
      enrichedAssets: [],
      projects: [],
      assetLastTaskMap: {},
      meta: headWithMaster,
    };
  }

  const allChunks: ProjectListBundle[] = [headWithMaster];
  const totalPages = Math.max(1, Math.ceil(total / POOL_PAGE_SIZE));

  for (let batchStart = 2; batchStart <= totalPages; batchStart += POOL_PARALLEL) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const pages = Array.from(
      { length: Math.min(POOL_PARALLEL, totalPages - batchStart + 1) },
      (_, i) => batchStart + i,
    );

    const batch = await Promise.all(
      pages.map((page) =>
        fetchCapexProjectListQuery(
          {
            ...baseParams,
            page,
            pageSize: POOL_PAGE_SIZE,
            skipCache: baseParams.skipCache ?? false,
          },
          accessToken,
        ),
      ),
    );
    allChunks.push(...batch);

    const loaded = mergePoolChunks(allChunks, headWithMaster).enrichedAssets.length;
    if (loaded >= total) break;
    if (batch.every((c) => c.enrichedAssets.length === 0)) break;
  }

  return mergePoolChunks(allChunks, headWithMaster);
}
