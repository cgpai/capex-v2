import { fetchCapexProjectListQuery } from '@/hooks/queries/fetchCapexProjectListQuery';

import type { ProjectListBundle } from '@/services/capexProjectListApi';

import { fetchAllProjectListForExport } from '@/services/fetchAllProjectListForExport';

import type { ProjectListQueryParams, ProjectListQueryResult } from '@/services/projectListQueryTypes';

import { dedupeEnrichedAssetsById, sortEnrichedAssetsByOption } from '@/screens/CapexProjectList/listUtils';

import {

  compareAssetsForProjectListSort,

  pickLeadingStreamIndex,

  type PeriodAssetStreamState,

} from '@/screens/CapexProjectList/projectListPeriodMerge';

import { normAssetKey } from '@/lib/assetKeys';

import type { EnrichedAsset, Project } from '@/types';



type MergedProjectListBaseParams = Omit<

  ProjectListQueryParams,

  'periodName' | 'page' | 'pageSize' | 'exportAll'

>;



const PERIOD_SLICE_PAGE_SIZE = 200;



function tagProjectsWithPeriod(bundle: ProjectListQueryResult, periodName: string): ProjectListQueryResult {

  return {

    ...bundle,

    projects: bundle.projects.map((p) =>

      (p.periodName ?? '').trim() ? p : { ...p, periodName },

    ),

  };

}



function mergeBundleMeta(bundles: ProjectListQueryResult[]): ProjectListBundle {

  const mergeById = <T extends { id: string | number }>(items: T[]): T[] => {

    const map = new Map<string, T>();

    for (const item of items) {

      map.set(String(item.id), item);

    }

    return Array.from(map.values());

  };



  const workflows = mergeById(bundles.flatMap((b) => b.workflows));

  const archetypes = mergeById(bundles.flatMap((b) => b.archetypes));

  const hus = mergeById(bundles.flatMap((b) => b.hus));

  const users = mergeById(bundles.flatMap((b) => b.users));

  const priorities = mergeById(bundles.flatMap((b) => b.priorities));

  const allRoles = mergeById(bundles.flatMap((b) => b.allRoles));

  const allTasks = mergeById(bundles.flatMap((b) => b.allTasks));



  const projectsById = new Map<string, Project>();

  const assetLastTaskMap: Record<string, string> = {};

  for (const bundle of bundles) {

    for (const project of bundle.projects) {

      projectsById.set(String(project.id), project);

    }

    Object.entries(bundle.assetLastTaskMap).forEach(([k, v]) => {

      assetLastTaskMap[normAssetKey(k)] = v;

    });

  }



  return {

    enrichedAssets: [],

    projects: Array.from(projectsById.values()),

    workflows,

    archetypes,

    hus,

    users,

    priorities,

    allRoles,

    allTasks,

    assetLastTaskMap,

  };

}



async function fetchPeriodTotal(

  periodName: string,

  baseParams: MergedProjectListBaseParams,

  accessToken?: string | null,

): Promise<{ total: number; bundle: ProjectListQueryResult | null }> {

  const head = await fetchCapexProjectListQuery(

    {

      ...baseParams,

      periodName,

      page: 1,

      pageSize: 1,

      skipCache: baseParams.skipCache ?? true,

    },

    accessToken,

  );

  return {

    total: typeof head.totalAssetCount === 'number' ? head.totalAssetCount : head.enrichedAssets.length,

    bundle: tagProjectsWithPeriod(head, periodName),

  };

}



async function refillPeriodStream(

  stream: PeriodAssetStreamState,

  baseParams: MergedProjectListBaseParams,

  accessToken?: string | null,

): Promise<void> {

  if (stream.exhausted) return;

  const chunk = await fetchCapexProjectListQuery(

    {

      ...baseParams,

      periodName: stream.periodName,

      page: stream.page,

      pageSize: PERIOD_SLICE_PAGE_SIZE,

      skipCache: baseParams.skipCache ?? true,

    },

    accessToken,

  );

  const tagged = tagProjectsWithPeriod(chunk, stream.periodName);

  if (tagged.enrichedAssets.length === 0) {

    stream.exhausted = true;

    return;

  }

  stream.buffer.push(...tagged.enrichedAssets);
  for (const project of tagged.projects) {
    stream.projectsById.set(String(project.id), project);
  }

  stream.page += 1;

  if (tagged.enrichedAssets.length < PERIOD_SLICE_PAGE_SIZE) {

    stream.exhausted = true;

  }

}



async function ensureStreamHead(

  stream: PeriodAssetStreamState,

  baseParams: MergedProjectListBaseParams,

  accessToken?: string | null,

): Promise<void> {

  while (stream.buffer.length === 0 && !stream.exhausted) {

    await refillPeriodStream(stream, baseParams, accessToken);

  }

}



/**

 * Merge multiple budget periods with global asset-code sort, then paginate.

 */

async function fetchMultiPeriodMergedPage(

  periodNames: string[],

  baseParams: MergedProjectListBaseParams,

  page: number,

  pageSize: number,

  accessToken?: string | null,

): Promise<ProjectListQueryResult> {

  const periods = periodNames.slice().sort((a, b) => a.localeCompare(b, 'id'));

  const periodTotals = await Promise.all(

    periods.map(async (periodName) => {

      const row = await fetchPeriodTotal(periodName, baseParams, accessToken);

      return { periodName, ...row };

    }),

  );



  const totalAssetCount = periodTotals.reduce((sum, row) => sum + row.total, 0);

  const streams: PeriodAssetStreamState[] = periodTotals

    .filter((row) => row.total > 0)

    .map((row) => ({

      periodName: row.periodName,

      total: row.total,

      buffer: [],

      projectsById: new Map<string, Project>(),

      page: 1,

      exhausted: false,

    }));



  const metaBundles = periodTotals

    .map((row) => row.bundle)

    .filter((bundle): bundle is ProjectListQueryResult => bundle != null);



  const globalOffset = Math.max(0, (page - 1) * pageSize);

  let skipped = 0;

  const pageAssets: EnrichedAsset[] = [];
  const seenPageAssetIds = new Set<string>();



  while (pageAssets.length < pageSize) {

    await Promise.all(streams.map((stream) => ensureStreamHead(stream, baseParams, accessToken)));

    const bestIdx = pickLeadingStreamIndex(streams, baseParams.sortBy);

    if (bestIdx < 0) break;



    const asset = streams[bestIdx].buffer.shift()!;
    const assetKey = normAssetKey(asset.id);
    if (seenPageAssetIds.has(assetKey)) {
      continue;
    }

    if (skipped < globalOffset) {

      skipped += 1;
      seenPageAssetIds.add(assetKey);

      continue;

    }

    seenPageAssetIds.add(assetKey);
    pageAssets.push(asset);

  }



  const meta = mergeBundleMeta(metaBundles);

  const pageProjectIds = new Set(pageAssets.map((asset) => String(asset.projectId)));

  const pageProjectsById = new Map<string, Project>();
  for (const project of meta.projects) {
    pageProjectsById.set(String(project.id), project);
  }
  for (const stream of streams) {
    stream.projectsById.forEach((project, id) => {
      pageProjectsById.set(id, project);
    });
  }
  const projects = [...pageProjectIds]
    .map((id) => pageProjectsById.get(id))
    .filter((project): project is Project => project != null);



  return {

    ...meta,

    enrichedAssets: pageAssets,

    projects,

    assetLastTaskMap: Object.fromEntries(

      pageAssets

        .map((asset) => {

          const key = normAssetKey(asset.id);

          const value = meta.assetLastTaskMap[key];

          return value ? ([key, value] as const) : null;

        })

        .filter((entry): entry is readonly [string, string] => entry != null),

    ),

    totalAssetCount,

    page,

    pageSize,

  };

}



/**

 * Server-side table fetch for one or many budget periods.

 * Single period delegates to `/project-list/query`; multi-period merges with global sort.

 */

export async function fetchMergedProjectListPage(

  periodNames: string[],

  baseParams: MergedProjectListBaseParams,

  page: number,

  pageSize: number,

  accessToken?: string | null,

): Promise<ProjectListQueryResult> {

  const periods = periodNames.map((p) => p.trim()).filter(Boolean);

  if (periods.length === 0) {

    throw new Error('Periode budget belum dipilih.');

  }



  if (periods.length === 1) {

    const result = await fetchCapexProjectListQuery(

      {

        ...baseParams,

        periodName: periods[0],

        page,

        pageSize,

        skipCache: baseParams.skipCache ?? true,

      },

      accessToken,

    );

    return tagProjectsWithPeriod(result, periods[0]);

  }



  return fetchMultiPeriodMergedPage(periods, baseParams, page, pageSize, accessToken);

}



/**

 * Export helper — loads every filtered row across selected budget periods.

 */

export async function fetchAllMergedProjectListForExport(

  periodNames: string[],

  baseParams: MergedProjectListBaseParams,

  accessToken?: string | null,

): Promise<{

  enrichedAssets: EnrichedAsset[];

  projects: Project[];

  assetLastTaskMap: Record<string, string>;

}> {

  const periods = periodNames.map((p) => p.trim()).filter(Boolean);

  if (periods.length === 0) {

    throw new Error('Periode budget belum dipilih.');

  }



  if (periods.length === 1) {

    const full = await fetchAllProjectListForExport(

      {

        ...baseParams,

        periodName: periods[0],

        skipCache: true,

      },

      accessToken,

    );

    return {

      enrichedAssets: sortEnrichedAssetsByOption(full.enrichedAssets, baseParams.sortBy),

      projects: full.projects.map((p) =>

        (p.periodName ?? '').trim() ? p : { ...p, periodName: periods[0] },

      ),

      assetLastTaskMap: full.assetLastTaskMap,

    };

  }



  const sortedPeriods = periods.slice().sort((a, b) => a.localeCompare(b, 'id'));

  const chunks = await Promise.all(

    sortedPeriods.map((periodName) =>

      fetchAllProjectListForExport(

        {

          ...baseParams,

          periodName,

          skipCache: true,

        },

        accessToken,

      ),

    ),

  );



  const enrichedAssets: EnrichedAsset[] = [];

  const projectsById = new Map<string, Project>();

  const assetLastTaskMap: Record<string, string> = {};



  for (let i = 0; i < chunks.length; i += 1) {

    const periodName = sortedPeriods[i];

    const chunk = chunks[i];

    enrichedAssets.push(...chunk.enrichedAssets);

    for (const project of chunk.projects) {

      const tagged = (project.periodName ?? '').trim() ? project : { ...project, periodName };

      projectsById.set(String(tagged.id), tagged);

    }

    Object.entries(chunk.assetLastTaskMap).forEach(([k, v]) => {

      assetLastTaskMap[normAssetKey(k)] = v;

    });

  }



  return {

    enrichedAssets: sortEnrichedAssetsByOption(enrichedAssets, baseParams.sortBy),

    projects: Array.from(projectsById.values()),

    assetLastTaskMap,

  };

}


