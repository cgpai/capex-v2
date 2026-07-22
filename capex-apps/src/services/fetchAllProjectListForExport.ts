import { fetchCapexProjectListQuery } from '@/hooks/queries/fetchCapexProjectListQuery';
import { fetchProjectListExport } from '@/services/capexProjectListApi';
import type { ProjectListBundle } from '@/services/capexProjectListApi';
import type { ProjectListQueryParams } from '@/services/projectListQueryTypes';
import { normAssetKey } from '@/lib/assetKeys';
import type { EnrichedAsset, Project } from '@/types';

/** BE caps table UI at 500; export loops until all filtered rows are loaded. */
const EXPORT_PAGE_SIZE = 500;

export type ProjectListExportProgress = {
  loaded: number;
  total: number;
  page: number;
};

/**
 * Fetch every row matching current filters (paginated server-side) for Excel export.
 */
export async function fetchAllProjectListForExport(
  baseParams: Omit<ProjectListQueryParams, 'page' | 'pageSize'>,
  accessToken?: string | null,
  onProgress?: (p: ProjectListExportProgress) => void,
): Promise<{
  enrichedAssets: EnrichedAsset[];
  projects: Project[];
  assetLastTaskMap: Record<string, string>;
  meta: ProjectListBundle;
}> {
  const accumulated: EnrichedAsset[] = [];
  const projectsById = new Map<string, Project>();
  const lastMap: Record<string, string> = {};
  let meta: ProjectListBundle | null = null;
  let total = 0;
  let page = 1;

  try {
    const single = await fetchProjectListExport(baseParams, accessToken);
    meta = single;
    total =
      typeof single.totalAssetCount === 'number'
        ? single.totalAssetCount
        : single.enrichedAssets.length;
    for (const asset of single.enrichedAssets) {
      accumulated.push(asset);
    }
    for (const p of single.projects) {
      projectsById.set(String(p.id), p);
    }
    Object.entries(single.assetLastTaskMap).forEach(([k, v]) => {
      lastMap[normAssetKey(k)] = v;
    });
    onProgress?.({ loaded: accumulated.length, total, page: 1 });
    if (meta) {
      return {
        enrichedAssets: accumulated,
        projects: Array.from(projectsById.values()),
        assetLastTaskMap: lastMap,
        meta,
      };
    }
  } catch (exportErr) {
    console.warn('[capex-project-list:export] single-request export failed, falling back to chunks:', exportErr);
  }

  accumulated.length = 0;
  projectsById.clear();
  Object.keys(lastMap).forEach((k) => delete lastMap[k]);
  meta = null;
  total = 0;
  page = 1;

    while (true) {
    const chunk = await fetchCapexProjectListQuery(
      {
        ...baseParams,
        page,
        pageSize: EXPORT_PAGE_SIZE,
        skipCache: baseParams.skipCache ?? false,
        exportAll: true,
      },
      accessToken,
    );

    if (!meta) meta = chunk;
    total = typeof chunk.totalAssetCount === 'number' ? chunk.totalAssetCount : accumulated.length;

    for (const asset of chunk.enrichedAssets) {
      accumulated.push(asset);
    }
    for (const p of chunk.projects) {
      projectsById.set(String(p.id), p);
    }
    Object.entries(chunk.assetLastTaskMap).forEach(([k, v]) => {
      lastMap[normAssetKey(k)] = v;
    });

    onProgress?.({ loaded: accumulated.length, total, page });

    if (chunk.enrichedAssets.length === 0) break;
    if (typeof chunk._debug?.dbTruthCount === 'number' && accumulated.length >= chunk._debug.dbTruthCount) {
      break;
    }
    if (accumulated.length >= total) break;
    if (chunk.enrichedAssets.length < EXPORT_PAGE_SIZE) break;
    page += 1;
    const maxPages = Math.ceil(total / EXPORT_PAGE_SIZE) + 3;
    if (page > maxPages) {
      console.warn(
        `[capex-project-list:export] stopped at page ${page} loaded=${accumulated.length} expected=${total}`,
      );
      break;
    }
  }

  if (!meta) {
    throw new Error('Export gagal — tidak ada respons dari server.');
  }

  return {
    enrichedAssets: accumulated,
    projects: Array.from(projectsById.values()),
    assetLastTaskMap: lastMap,
    meta,
  };
}
