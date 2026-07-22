import { fetchCapexProjectListQuery } from '@/hooks/queries/fetchCapexProjectListQuery';
import type { ProjectListBundle } from '@/services/capexProjectListApi';
import type { ProjectListQueryParams } from '@/services/projectListQueryTypes';
import { normAssetKey } from '@/lib/assetKeys';
import type { EnrichedAsset, Project } from '@/types';

/** Chunk size for background pool warm (matches BE export cap). */
const POOL_PAGE_SIZE = 500;
/** Parallel in-flight chunk requests — faster than sequential export loop. */
const POOL_PARALLEL = 4;

export function isCompleteProjectListBundle(bundle: ProjectListBundle): boolean {
  const total = bundle.totalAssetCount;
  if (typeof total !== 'number' || total <= 0) return bundle.enrichedAssets.length > 0;
  return bundle.enrichedAssets.length >= total;
}

function mergePoolChunks(
  chunks: ProjectListBundle[],
): {
  enrichedAssets: EnrichedAsset[];
  projects: Project[];
  assetLastTaskMap: Record<string, string>;
  meta: ProjectListBundle;
} {
  const meta = chunks[0];
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
 * Background warm for client-side filters — parallel page fetches (not blocking first paint).
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
  const head = await fetchCapexProjectListQuery(
    {
      ...baseParams,
      page: 1,
      pageSize: 1,
      skipCache: baseParams.skipCache ?? false,
      exportAll: true,
    },
    accessToken,
  );
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const total =
    typeof head.totalAssetCount === 'number' ? head.totalAssetCount : head.enrichedAssets.length;
  if (total <= 0) {
    return {
      enrichedAssets: [],
      projects: [],
      assetLastTaskMap: {},
      meta: head,
    };
  }

  const totalPages = Math.max(1, Math.ceil(total / POOL_PAGE_SIZE));
  const allChunks: ProjectListBundle[] = [];

  for (let batchStart = 1; batchStart <= totalPages; batchStart += POOL_PARALLEL) {
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
            exportAll: true,
          },
          accessToken,
        ),
      ),
    );
    allChunks.push(...batch);

    if (batch.some((c) => c.enrichedAssets.length < POOL_PAGE_SIZE)) break;
    const loaded = mergePoolChunks(allChunks).enrichedAssets.length;
    if (loaded >= total) break;
  }

  return mergePoolChunks(allChunks);
}
