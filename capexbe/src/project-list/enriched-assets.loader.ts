import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRecords, toCamelCase } from './supabase-helpers';

export async function fetchProjectsByPeriodName(supabase: SupabaseClient, selectedPeriodName: string): Promise<any[]> {
  const out: any[] = [];
  let from = 0;
  let hasMore = true;
  const batchSize = 400;
  while (hasMore) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('period_name', selectedPeriodName)
      .range(from, from + batchSize - 1);
    if (error) throw new Error(`projects(period_name): ${error.message}`);
    if (data && data.length > 0) {
      out.push(...data);
      from += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }
  return out;
}

import type { AssetTypeGroupMasterMaps } from './project-list-query.util';

/** Master-aligned: asset_type_id first, then workflow_set_id. */
function resolveAssetTypeGroupNameFromMaster(
  assetTypeId: string | number | null | undefined,
  workflowSetId: string | number | null | undefined,
  maps?: AssetTypeGroupMasterMaps | Map<string, string>,
): string | undefined {
  const legacyWsMap = maps instanceof Map ? maps : maps?.groupNameByWorkflowSetId;
  const typeMap = maps instanceof Map ? undefined : maps?.groupNameByTypeId;

  const typeId = assetTypeId == null ? '' : String(assetTypeId).trim();
  if (typeId && typeMap?.has(typeId)) return typeMap.get(typeId);

  const wsId = workflowSetId == null ? '' : String(workflowSetId).trim();
  if (wsId && legacyWsMap?.has(wsId)) return legacyWsMap.get(wsId);

  return undefined;
}

export function enrichAssetRowsFromJoinedSelect(
  pageRows: any[],
  assetTypeGroupMaps?: AssetTypeGroupMasterMaps | Map<string, string>,
): any[] {
  const out: any[] = [];
  for (const row of pageRows) {
    const project = row.projects;
    if (!project) continue;
    const lifecycle = String(row.lifecycle_status ?? row.lifecycleStatus ?? '').trim().toLowerCase();
    if (lifecycle === 'cancel' || lifecycle === 'cancelled' || lifecycle === 'canceled') continue;

    const hu = project.hospital_units_config;
    const archRaw = hu?.archetypes_config;
    const archObj = Array.isArray(archRaw) ? archRaw[0] : archRaw;
    const archName = archObj?.name ? String(archObj.name) : '';

    out.push({
      id: row.id,
      assetCode: row.asset_code || row.assetCode || '',
      assetName: row.asset_name || row.assetName || '',
      description: row.description || '',
      projectId: project.id,
      projectName: project.project_name || project.projectName || '',
      projectCode: project.project_code || project.projectCode || '',
      huName: hu?.name || '',
      archetypeName: archName || '',
      completionRate: 0,
      budgetPlan: Number(row.budget_plan || row.budgetPlan) || 0,
      consumedBudget: Number(row.consumed_budget || row.consumedBudget) || 0,
      budgetAllocated: Number(row.budget_allocated || row.budgetAllocated) || 0,
      workflowSetId: row.workflow_set_id || row.workflowSetId || '',
      budgetCategoryId:
        row.budget_category_id ||
        row.budgetCategoryId ||
        project.budget_category_id ||
        project.budgetCategoryId ||
        '',
      projectPriorityId: project.priority_id || project.priorityId || '',
      endTargetDate: row.end_target_date || row.endTargetDate || null,
      catalogueId: row.catalogue_id || row.catalogueId || null,
        poNumber: row.po_number || row.poNumber || null,
        cprId: row.cpr_id || row.cprId || null,
        poDate: row.po_date || row.poDate || null,
        isGoodsReceived:
          row.is_goods_received !== undefined ? row.is_goods_received : row.isGoodsReceived || false,
        bddPriority: row.bdd_priority || row.bddPriority || null,
        assetTypeId: row.asset_type_id || row.assetTypeId || null,
        qty: Number(row.qty ?? 1),
        receivedQty: Number(row.received_qty ?? row.receivedQty ?? 0),
      assetTypeGroupName: resolveAssetTypeGroupNameFromMaster(
        row.asset_type_id || row.assetTypeId,
        row.workflow_set_id || row.workflowSetId,
        assetTypeGroupMaps,
      ),
    });
  }
  return out;
}

/** Minimal project rows from PostgREST joined page — for column metadata when separate fetch is skipped. */
export function extractProjectsFromJoinedRows(pageRows: any[]): any[] {
  const byId = new Map<string, any>();
  for (const row of pageRows) {
    const project = row.projects;
    if (!project?.id) continue;
    const id = String(project.id);
    if (byId.has(id)) continue;
    byId.set(id, toCamelCase(project));
  }
  return Array.from(byId.values());
}

export type MasterEnrichContext = {
  archetypes: { id: string; name: string }[];
  hus: { id: string; name: string; archetypeId?: string; archetype_id?: string }[];
  assetTypeGroupMaps?: AssetTypeGroupMasterMaps | Map<string, string>;
  /** @deprecated Use assetTypeGroupMaps */
  groupNameByWorkflowSetId?: Map<string, string>;
};

/** Map baris `assets` + konteks proyek/HU/archetype — pakai master cache, bukan fetchAllRecords. */
export function enrichRawAssetRowsWithMaster(
  allProjectsFromDb: any[],
  rawAssetRows: any[],
  master: MasterEnrichContext,
  completionRates?: Map<string, number>,
): any[] {
  const projectMap = new Map(allProjectsFromDb.map((p: any) => [String(p.id), p]));
  const huMap = new Map(master.hus.map((hu: any) => [String(hu.id), hu]));
  const archetypeMap = new Map(master.archetypes.map((arch: any) => [String(arch.id), arch]));

  return rawAssetRows
    .map((asset: any) => {
      const projectId = asset.project_id || asset.projectId;
      const project = projectMap.get(String(projectId));
      if (!project) return null;

      const lifecycle = String(asset.lifecycle_status ?? asset.lifecycleStatus ?? '').trim().toLowerCase();
      if (lifecycle === 'cancel' || lifecycle === 'cancelled' || lifecycle === 'canceled') return null;

      const projectHospitalUnitId = project.hospital_unit_id || project.hospitalUnitId;
      const hu = projectHospitalUnitId ? huMap.get(String(projectHospitalUnitId)) : null;
      const archetype = hu ? archetypeMap.get(String(hu.archetype_id || hu.archetypeId)) : null;
      const rateKey = String(asset.id);

      return {
        id: asset.id,
        assetCode: asset.asset_code || asset.assetCode || '',
        assetName: asset.asset_name || asset.assetName || '',
        description: asset.description || '',
        projectId: project.id,
        projectName: project.project_name || project.projectName || '',
        projectCode: project.project_code || project.projectCode || '',
        huName: hu?.name || '',
        archetypeName: archetype?.name || '',
        completionRate: completionRates?.get(rateKey) ?? completionRates?.get(asset.id) ?? 0,
        budgetPlan: Number(asset.budget_plan || asset.budgetPlan) || 0,
        consumedBudget: Number(asset.consumed_budget || asset.consumedBudget) || 0,
        budgetAllocated: Number(asset.budget_allocated || asset.budgetAllocated) || 0,
        workflowSetId: asset.workflow_set_id || asset.workflowSetId || '',
        budgetCategoryId:
          asset.budget_category_id ||
          asset.budgetCategoryId ||
          project.budget_category_id ||
          project.budgetCategoryId ||
          '',
        projectPriorityId: project.priority_id || project.priorityId || '',
        endTargetDate: asset.end_target_date || asset.endTargetDate || null,
        catalogueId: asset.catalogue_id || asset.catalogueId || null,
        poNumber: asset.po_number || asset.poNumber || null,
        cprId: asset.cpr_id || asset.cprId || null,
        poDate: asset.po_date || asset.poDate || null,
        isGoodsReceived:
          asset.is_goods_received !== undefined ? asset.is_goods_received : asset.isGoodsReceived || false,
        bddPriority: asset.bdd_priority || asset.bddPriority || null,
        assetTypeId: asset.asset_type_id || asset.assetTypeId || null,
        qty: Number(asset.qty ?? 1),
        receivedQty: Number(asset.received_qty ?? asset.receivedQty ?? 0),
        assetTypeGroupName: resolveAssetTypeGroupNameFromMaster(
          asset.asset_type_id || asset.assetTypeId,
          asset.workflow_set_id || asset.workflowSetId,
          master.assetTypeGroupMaps ?? master.groupNameByWorkflowSetId,
        ),
      };
    })
    .filter((asset): asset is NonNullable<typeof asset> => asset !== null);
}

/** Map baris `assets` + konteks proyek/HU/archetype → enriched (legacy / fallback — scans config tables). */
export async function enrichRawAssetRowsForPeriod(
  supabase: SupabaseClient,
  allProjectsFromDb: any[],
  rawAssetRows: any[],
  completionRates?: Map<string, number>,
): Promise<any[]> {
  const fetchAllRecordsHelper = (tableName: string, selectQuery: string = '*') =>
    fetchAllRecords(supabase, tableName, selectQuery);

  const [allHUsFromDb, allArchetypesFromDb, allAssetTypesRaw, allAssetGroupsRaw] = await Promise.all([
    fetchAllRecordsHelper('hospital_units_config', '*'),
    fetchAllRecordsHelper('archetypes_config', '*'),
    fetchAllRecordsHelper('asset_type_configs', '*'),
    fetchAllRecordsHelper('asset_type_groups', '*'),
  ]);

  const allAssetTypes = (allAssetTypesRaw || []).map(toCamelCase);
  const allAssetGroups = (allAssetGroupsRaw || []).map(toCamelCase);

  const projectMap = new Map(allProjectsFromDb.map((p: any) => [String(p.id), p]));
  const huMap = new Map(allHUsFromDb.map((hu: any) => [String(hu.id), hu]));
  const archetypeMap = new Map(allArchetypesFromDb.map((arch: any) => [String(arch.id), arch]));
  const assetTypeMap = new Map(allAssetTypes.map((at: any) => [at.workflowSetId, at]));
  const assetGroupMap = new Map(allAssetGroups.map((ag: any) => [ag.id, ag]));

  return rawAssetRows
    .map((asset: any) => {
      const projectId = asset.project_id || asset.projectId;
      const project = projectMap.get(String(projectId));

      if (!project) return null;

      const lifecycle = String(asset.lifecycle_status ?? asset.lifecycleStatus ?? '').trim().toLowerCase();
      if (lifecycle === 'cancel' || lifecycle === 'cancelled' || lifecycle === 'canceled') return null;

      const projectHospitalUnitId = project.hospital_unit_id || project.hospitalUnitId;
      const hu = projectHospitalUnitId ? huMap.get(String(projectHospitalUnitId)) : null;
      const archetype = hu ? archetypeMap.get(String(hu.archetype_id || hu.archetypeId)) : null;
      const assetType = assetTypeMap.get(asset.workflow_set_id || asset.workflowSetId);
      const assetGroup = assetType?.groupId ? assetGroupMap.get(assetType.groupId) : undefined;

      const rateKey = String(asset.id);
      return {
        id: asset.id,
        assetCode: asset.asset_code || asset.assetCode || '',
        assetName: asset.asset_name || asset.assetName || '',
        description: asset.description || '',
        projectId: project.id,
        projectName: project.project_name || project.projectName || '',
        projectCode: project.project_code || project.projectCode || '',
        huName: hu?.name || '',
        archetypeName: archetype?.name || '',
        completionRate: completionRates?.get(rateKey) ?? completionRates?.get(asset.id) ?? 0,
        assetTypeGroupName: assetGroup?.name,
        budgetPlan: Number(asset.budget_plan || asset.budgetPlan) || 0,
        consumedBudget: Number(asset.consumed_budget || asset.consumedBudget) || 0,
        budgetAllocated: Number(asset.budget_allocated || asset.budgetAllocated) || 0,
        workflowSetId: asset.workflow_set_id || asset.workflowSetId || '',
        budgetCategoryId:
          asset.budget_category_id ||
          asset.budgetCategoryId ||
          project.budget_category_id ||
          project.budgetCategoryId ||
          '',
        projectPriorityId: project.priority_id || project.priorityId || '',
        endTargetDate: asset.end_target_date || asset.endTargetDate || null,
        catalogueId: asset.catalogue_id || asset.catalogueId || null,
        poNumber: asset.po_number || asset.poNumber || null,
        isGoodsReceived:
          asset.is_goods_received !== undefined ? asset.is_goods_received : asset.isGoodsReceived || false,
        bddPriority: asset.bdd_priority || asset.bddPriority || null,
        assetTypeId: asset.asset_type_id || asset.assetTypeId || null,
      };
    })
    .filter((asset): asset is NonNullable<typeof asset> => asset !== null);
}

const ASSET_PERIOD_JOIN_SELECT = `
  *,
  projects!inner (
    period_name
  )
`;

/** Paginated fetch — PostgREST default cap (~1000) would silently drop rows without `.range()`. */
export async function fetchAllAssetsForPeriodName(
  supabase: SupabaseClient,
  periodName: string,
): Promise<any[]> {
  const out: any[] = [];
  let from = 0;
  const batchSize = 400;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('assets')
      .select(ASSET_PERIOD_JOIN_SELECT)
      .eq('projects.period_name', periodName)
      .order('id', { ascending: true })
      .range(from, from + batchSize - 1);
    if (error) throw new Error(`assets(period_name): ${error.message}`);

    const batch = (data || []).map((row: any) => {
      const { projects: _nested, ...asset } = row;
      return asset;
    });
    out.push(...batch);
    hasMore = batch.length === batchSize;
    from += batchSize;
  }

  return out;
}

/** Mirrors capexapp budgetService.getAllEnrichedAssets (Supabase path). Keep in sync when that logic changes. */
export async function getAllEnrichedAssetsForPeriod(
  supabase: SupabaseClient,
  periodName?: string,
  completionRates?: Map<string, number>,
): Promise<any[]> {
  const fetchAllRecordsHelper = (tableName: string, selectQuery: string = '*') =>
    fetchAllRecords(supabase, tableName, selectQuery);

  if (periodName) {
    const { data: periodData } = await supabase
      .from('budget_periods')
      .select('period_name')
      .eq('period_name', periodName)
      .maybeSingle();

    if (!periodData) return [];
  }

  const allProjectsFromDb = periodName
    ? await fetchProjectsByPeriodName(supabase, periodName)
    : await fetchAllRecordsHelper('projects', '*');
  const periodProjectIds = new Set(allProjectsFromDb.map((p: any) => String(p.id)));
  const allAssetsFromDb = periodName
    ? await fetchAllAssetsForPeriodName(supabase, periodName)
    : await fetchAllRecordsHelper('assets', '*');

  const filteredProjectIds = new Set(allProjectsFromDb.map((p: any) => String(p.id)));

  let filteredAssets = allAssetsFromDb;

  if (periodName) {
    if (filteredProjectIds.size === 0) {
      filteredAssets = [];
    } else {
      filteredAssets = allAssetsFromDb.filter((asset: any) => filteredProjectIds.has(String(asset.project_id)));
    }
  } else if (!periodName) {
    filteredAssets = allAssetsFromDb;
  }

  return enrichRawAssetRowsForPeriod(supabase, allProjectsFromDb, filteredAssets, completionRates);
}

/**
 * Satu halaman aset per periode (query DB `range`) + totalCount untuk lazy load di FE.
 */
export async function getEnrichedAssetsPageForPeriod(
  supabase: SupabaseClient,
  periodName: string,
  page: number,
  pageSize: number,
  completionRates?: Map<string, number>,
): Promise<{ enrichedAssets: any[]; totalCount: number }> {
  if (!periodName?.trim()) {
    return { enrichedAssets: [], totalCount: 0 };
  }

  const { data: periodData } = await supabase
    .from('budget_periods')
    .select('period_name')
    .eq('period_name', periodName)
    .maybeSingle();

  if (!periodData) {
    return { enrichedAssets: [], totalCount: 0 };
  }

  const allProjectsFromDb = await fetchProjectsByPeriodName(supabase, periodName);
  if (allProjectsFromDb.length === 0) {
    return { enrichedAssets: [], totalCount: 0 };
  }

  // Hindari `.in('project_id', [...ribuan UUID])` — URL/query PostgREST sering melewati batas → 500.
  // Pakai join ke projects.period_name (satu filter string).
  /** `!inner` + filter periode menggantikan `.in(project_id, …)` (ribuan UUID sering memecah batas query). */
  const assetSelectWithPeriod = `
    *,
    projects!inner (
      period_name
    )
  `;

  const { count, error: countErr } = await supabase
    .from('assets')
    .select(assetSelectWithPeriod, { count: 'exact', head: true })
    .eq('projects.period_name', periodName);
  if (countErr) {
    throw new Error(`assets count: ${countErr.message}`);
  }
  const totalCount = count ?? 0;

  const safePage = Math.max(1, page);
  const safeSize = Math.min(500, Math.max(1, pageSize));
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;

  const { data: pageRowsRaw, error: pageErr } = await supabase
    .from('assets')
    .select(assetSelectWithPeriod)
    .eq('projects.period_name', periodName)
    .order('id', { ascending: true })
    .range(from, to);
  if (pageErr) {
    throw new Error(`assets page: ${pageErr.message}`);
  }

  const pageRows = (pageRowsRaw || []).map((row: any) => {
    const { projects: _nested, ...asset } = row;
    return asset;
  });

  const enrichedAssets = await enrichRawAssetRowsForPeriod(
    supabase,
    allProjectsFromDb,
    pageRows,
    completionRates,
  );
  return { enrichedAssets, totalCount };
}
