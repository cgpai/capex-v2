import type { SupabaseClient } from '@supabase/supabase-js';
import {
  enrichAssetRowsFromJoinedSelect,
  extractProjectsFromJoinedRows,
} from '../project-list/enriched-assets.loader';
import {
  getAllArchetypesConfig,
  getAllHospitalUnitsConfig,
  getAllProjectPriorities,
  getAllTasks,
  getAllWorkflowSets,
} from '../project-list/master-data.loader';
import {
  loadAssetTypeGroupMasterMaps,
  poUpdateAssetListSelect,
} from '../project-list/project-list-query.util';
import { fetchAllRecordsWhereEq, normId, toCamelCase } from '../project-list/supabase-helpers';

export type PoUpdatePageBundleDto = {
  assets: any[];
  archetypes: any[];
  hus: any[];
  projects: any[];
  priorities: any[];
  assetHasPOMap: Record<string, boolean>;
  assetLastTaskMap: Record<string, string>;
  totalAssetCount: number;
};

const MASTER_CACHE_TTL_MS = 5 * 60 * 1000;
const ASSET_PAGE_SIZE = 500;
const STATUS_PAGE_SIZE = 1000;

const normalizeName = (value: unknown): string => String(value ?? '').trim().toLowerCase();

type MasterPayload = {
  archetypes: any[];
  hus: any[];
  priorities: any[];
  allTasks: any[];
  allWorkflows: any[];
  assetTypeGroupMaps: Awaited<ReturnType<typeof loadAssetTypeGroupMasterMaps>>;
};

let masterCache: { expiresAt: number; payload: MasterPayload } | null = null;

async function loadMasterPayload(client: SupabaseClient): Promise<MasterPayload> {
  if (masterCache && masterCache.expiresAt > Date.now()) {
    return masterCache.payload;
  }

  const [archetypes, hus, priorities, allTasks, allWorkflows, assetTypeGroupMaps] =
    await Promise.all([
      getAllArchetypesConfig(client),
      getAllHospitalUnitsConfig(client),
      getAllProjectPriorities(client),
      getAllTasks(client),
      getAllWorkflowSets(client),
      loadAssetTypeGroupMasterMaps(client),
    ]);

  const payload: MasterPayload = {
    archetypes,
    hus,
    priorities,
    allTasks,
    allWorkflows,
    assetTypeGroupMaps,
  };
  masterCache = { expiresAt: Date.now() + MASTER_CACHE_TTL_MS, payload };
  return payload;
}

/** Satu query join per halaman — hindari `.in(project_id, …ribuan UUID)`. */
async function fetchJoinedAssetRowsForPeriod(
  client: SupabaseClient,
  periodName: string,
): Promise<any[]> {
  const select = poUpdateAssetListSelect();
  const rows: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await client
      .from('assets')
      .select(select)
      .eq('projects.period_name', periodName)
      .order('id', { ascending: true })
      .range(from, from + ASSET_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`assets(period=${periodName}): ${error.message}`);
    }
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < ASSET_PAGE_SIZE) break;
    from += ASSET_PAGE_SIZE;
  }

  return rows;
}

/** Done statuses scoped by period via join — tanpa `.in(asset_id, …ribuan UUID)`. */
async function fetchDoneStatusesForPeriod(
  client: SupabaseClient,
  periodName: string,
): Promise<any[]> {
  const select =
    'asset_id, task_id, status, completed_at, assets!inner(projects!inner(period_name))';
  const rows: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await client
      .from('asset_task_statuses')
      .select(select)
      .eq('status', 'Done')
      .eq('assets.projects.period_name', periodName)
      .range(from, from + STATUS_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`asset_task_statuses(period=${periodName}): ${error.message}`);
    }
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < STATUS_PAGE_SIZE) break;
    from += STATUS_PAGE_SIZE;
  }

  return rows;
}

function buildPoPageMaps(
  assets: any[],
  allTasks: any[],
  allWorkflows: any[],
  poSentLogs: any[],
  doneStatuses: any[],
): { assetHasPOMap: Record<string, boolean>; assetLastTaskMap: Record<string, string> } {
  const poSentTask = allTasks.find(
    (t) => normalizeName(t.name) === 'po sent to vendor' || t.id === 'TASK-C-27',
  );
  const poSentAssetIds = new Set(
    poSentLogs.map((log) => normId(log.asset_id ?? log.assetId)).filter(Boolean),
  );

  const assetHasPOMap: Record<string, boolean> = {};
  for (const asset of assets) {
    const id = String(asset.id);
    assetHasPOMap[id] =
      poSentAssetIds.has(id) || Boolean(String(asset.poNumber ?? '').trim());
  }

  const workflowsMap = new Map(allWorkflows.map((w) => [String(w.id), w]));
  const tasksMap = new Map(allTasks.map((t) => [String(t.id), t]));
  const latestDoneByAsset = new Map<string, { taskId: string; at: number }>();

  for (const row of doneStatuses) {
    const assetId = normId(row.asset_id ?? row.assetId);
    const taskId = normId(row.task_id ?? row.taskId);
    if (!assetId || !taskId) continue;
    const at = new Date(String(row.completed_at ?? row.completedAt ?? 0)).getTime();
    if (!Number.isFinite(at)) continue;
    const prev = latestDoneByAsset.get(assetId);
    if (!prev || at > prev.at) {
      latestDoneByAsset.set(assetId, { taskId, at });
    }
  }

  const assetLastTaskMap: Record<string, string> = {};
  for (const asset of assets) {
    const latest = latestDoneByAsset.get(String(asset.id));
    if (!latest) continue;
    const workflow = workflowsMap.get(String(asset.workflowSetId ?? ''));
    if (!workflow?.steps?.length) continue;
    const step = workflow.steps.find((s: { taskId?: string }) => s.taskId === latest.taskId);
    if (!step) continue;
    const task = tasksMap.get(latest.taskId);
    if (task?.name) assetLastTaskMap[String(asset.id)] = String(task.name);
  }

  if (!poSentTask?.id) {
    for (const asset of assets) {
      const id = String(asset.id);
      if (!assetHasPOMap[id] && String(asset.poNumber ?? '').trim()) {
        assetHasPOMap[id] = true;
      }
    }
  }

  return { assetHasPOMap, assetLastTaskMap };
}

export async function loadPoUpdatePageBundle(
  client: SupabaseClient,
  periodName?: string,
): Promise<PoUpdatePageBundleDto> {
  const period = periodName?.trim() || '';
  if (!period) {
    return {
      assets: [],
      archetypes: [],
      hus: [],
      projects: [],
      priorities: [],
      assetHasPOMap: {},
      assetLastTaskMap: {},
      totalAssetCount: 0,
    };
  }

  const master = await loadMasterPayload(client);
  const { archetypes, hus, priorities, allTasks, allWorkflows, assetTypeGroupMaps } = master;

  const poSentTask = allTasks.find(
    (t) => normalizeName(t.name) === 'po sent to vendor' || t.id === 'TASK-C-27',
  );

  const [joinedRows, poSentLogs, doneStatuses] = await Promise.all([
    fetchJoinedAssetRowsForPeriod(client, period),
    poSentTask?.id
      ? fetchAllRecordsWhereEq(client, 'task_logs', 'task_id', String(poSentTask.id), 'asset_id')
      : Promise.resolve([]),
    fetchDoneStatusesForPeriod(client, period),
  ]);

  const assets = enrichAssetRowsFromJoinedSelect(joinedRows, assetTypeGroupMaps);
  const projects = extractProjectsFromJoinedRows(joinedRows).map(toCamelCase);

  const { assetHasPOMap, assetLastTaskMap } = buildPoPageMaps(
    assets,
    allTasks,
    allWorkflows,
    poSentLogs,
    doneStatuses,
  );

  return {
    assets,
    archetypes,
    hus,
    projects,
    priorities,
    assetHasPOMap,
    assetLastTaskMap,
    totalAssetCount: assets.length,
  };
}
