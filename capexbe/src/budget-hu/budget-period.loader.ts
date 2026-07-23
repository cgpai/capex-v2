import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BATCH_SIZE,
  fetchAllRecords,
  fetchAllRecordsWhereEq,
  fetchRecordsInBatches,
  toCamelCase,
} from '../project-list/supabase-helpers';

const ARCHETYPE_SELECT = 'id,name';
const HU_SELECT = 'id,name,code,archetype_id,is_pipeline';
const CATEGORY_BUDGET_SELECT =
  'period_name,budget_category_id,budget_plan,budget_carry_forward,budget_allocated,approved_budget,consumed_budget,asset_count,no_budget_asset_count';
const ARCH_BUDGET_SELECT = 'period_name,archetype_id,budget_category_id,budget_plan';
const HU_BUDGET_SELECT = 'period_name,hospital_unit_id,budget_category_id,budget_plan';
/** PostgREST can 500 if a named column is missing — keep * and rely on HU scoping for speed. */
const PROJECT_SELECT_FULL = '*';
/** Budget HU — one HU scope: table + save fields without select('*'). */
const PROJECT_SELECT_HU =
  'id,hospital_unit_id,period_name,project_code,project_name,ax_code,budget_category_id,priority_id,type,status,budget_plan,budget_carry_forward,budget_allocated,approved_budget,consumed_budget,revenue_projection,target_start,end_date,budget_revenue_permonth,target_budget_start,is_routine_asset_aggregator,is_pipeline_project,completion_rate,task_to_do,owner,plan,asset_code,asset_name,stage';
/** Budget Network / Siloam — budget aggregates only, no asset hydration. */
const PROJECT_SELECT_NETWORK =
  'id,hospital_unit_id,period_name,budget_category_id,budget_plan,budget_carry_forward,budget_allocated,approved_budget,consumed_budget,is_routine_asset_aggregator,is_pipeline_project';
/** FS screens — project fields + slim assets (skip pipeline). */
const PROJECT_SELECT_FS =
  'id,hospital_unit_id,period_name,project_code,project_name,ax_code,budget_category_id,budget_plan,budget_carry_forward,budget_allocated,approved_budget,consumed_budget,target_start,end_date,budget_revenue_permonth,is_routine_asset_aggregator,is_pipeline_project';
const ASSET_SELECT = '*';
/** Budget HU — asset editor + budget rollups without select('*'). */
const ASSET_SELECT_HU =
  'id,project_id,asset_code,asset_name,description,budget_category_id,budget_plan,budget_allocated,consumed_budget,workflow_set_id,end_target_date,catalogue_id,po_number,cpr_id,po_date,is_goods_received,bdd_priority,asset_type_id,qty,received_qty,lifecycle_status';
const ASSET_SELECT_FS = 'id,project_id,budget_category_id,asset_code,asset_name,budget_plan,consumed_budget,lifecycle_status';
const PCB_SELECT = 'project_id,budget_category_id,budget_plan';
const PIPELINE_SELECT = 'project_id,room_id,catalogue_id,quantity';

export type LoadBudgetPeriodOptions = {
  /** When set, only hydrate projects/assets for this HU (dropdown structure still full). */
  hospitalUnitId?: string;
  /** Budget Network screens: slim projects, skip assets/pipeline. */
  networkView?: boolean;
  /** Budget Network shell — structure + budget plans only, no projects. */
  networkShell?: boolean;
  /** Budget Network — load projects for one category (+ routine aggregators). */
  categoryId?: string;
  /** FS Update / Approval / Realization — slim projects + minimal assets. */
  fsView?: boolean;
};

function routineCategoryConsumedFromProject(
  project: { categoryBudgetPlan?: Record<string, number>; consumedBudget?: number },
  categoryId: string,
): number {
  const totalConsumed = Number(project.consumedBudget) || 0;
  if (totalConsumed <= 0) return 0;
  const categoryPlan = Number(project.categoryBudgetPlan?.[categoryId]) || 0;
  if (categoryPlan <= 0) return 0;
  const totalPlan = Object.values(project.categoryBudgetPlan ?? {}).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0,
  );
  if (totalPlan <= 0) return 0;
  return (categoryPlan / totalPlan) * totalConsumed;
}

async function fetchProjectsForPeriod(
  client: SupabaseClient,
  periodIdentifier: string,
  options?: { hospitalUnitId?: string; projectSelect?: string },
): Promise<any[]> {
  const projectSelect = options?.projectSelect ?? PROJECT_SELECT_FULL;
  const huId = String(options?.hospitalUnitId ?? '').trim();
  if (!huId) {
    return fetchAllRecordsWhereEq(client, 'projects', 'period_name', periodIdentifier, projectSelect);
  }

  let allRecords: any[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await client
      .from('projects')
      .select(projectSelect)
      .eq('period_name', periodIdentifier)
      .eq('hospital_unit_id', huId)
      .range(from, from + BATCH_SIZE - 1);
    if (error) throw new Error(`projects(period+hu): ${error.message}`);
    if (data && data.length > 0) {
      allRecords = [...allRecords, ...data];
      from += BATCH_SIZE;
      hasMore = data.length === BATCH_SIZE;
    } else {
      hasMore = false;
    }
  }
  return allRecords;
}

/** Budget Network — one category: strategic projects + routine aggregators (PCB for routine). */
async function fetchNetworkProjectsForCategory(
  client: SupabaseClient,
  periodIdentifier: string,
  categoryId: string,
  projectSelect: string,
): Promise<any[]> {
  const cat = String(categoryId ?? '').trim();
  if (!cat) return [];

  const byId = new Map<string, any>();

  const fetchPaged = async (applyFilter: (q: any) => any) => {
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      let q = client.from('projects').select(projectSelect).eq('period_name', periodIdentifier);
      q = applyFilter(q);
      const { data, error } = await q.range(from, from + BATCH_SIZE - 1);
      if (error) throw new Error(`projects(network-category): ${error.message}`);
      if (data && data.length > 0) {
        for (const row of data as any[]) byId.set(String(row.id), row);
        from += BATCH_SIZE;
        hasMore = data.length === BATCH_SIZE;
      } else {
        hasMore = false;
      }
    }
  };

  await Promise.all([
    fetchPaged((q) => q.eq('budget_category_id', cat)),
    fetchPaged((q) => q.eq('is_routine_asset_aggregator', true)),
  ]);

  return Array.from(byId.values());
}

/**
 * Membangun `BudgetPeriod` di server.
 * Optional `hospitalUnitId` scopes project/asset hydration to one HU for fast Budget HU loads.
 */
export async function loadBudgetByPeriodName(
  client: SupabaseClient,
  periodName: string,
  options?: LoadBudgetPeriodOptions,
): Promise<any | null> {
  const { data: period, error: periodError } = await client
    .from('budget_periods')
    .select('*')
    .eq('period_name', periodName)
    .maybeSingle();

  if (periodError && periodError.code !== 'PGRST116') {
    throw new Error(periodError.message);
  }
  if (!period) return null;

  const pn = periodName.trim();
  const periodIdentifier = String((period as any).period_name || periodName).trim();
  const scopedHuId = String(options?.hospitalUnitId ?? '').trim();
  const networkView = options?.networkView === true;
  const networkShell = options?.networkShell === true;
  const categoryId = String(options?.categoryId ?? '').trim();
  const fsView = options?.fsView === true;
  const huView = Boolean(scopedHuId) && !networkView && !networkShell && !fsView;
  const projectSelect = networkView
    ? PROJECT_SELECT_NETWORK
    : fsView
      ? PROJECT_SELECT_FS
      : huView
        ? PROJECT_SELECT_HU
        : PROJECT_SELECT_FULL;
  const assetSelect = fsView ? ASSET_SELECT_FS : huView ? ASSET_SELECT_HU : ASSET_SELECT;

  let categoryBudgets: any[] = [];
  let archetypeBudgets: any[] = [];
  let hospitalUnitBudgets: any[] = [];
  if (!fsView) {
    try {
      const [allCatBudgets, allArchBudgets, allHuBudgets] = await Promise.all([
        fetchAllRecordsWhereEq(client, 'budget_period_category_budgets', 'period_name', pn, CATEGORY_BUDGET_SELECT),
        fetchAllRecordsWhereEq(client, 'budget_period_archetype_budgets', 'period_name', pn, ARCH_BUDGET_SELECT).catch(
          () => [],
        ),
        fetchAllRecordsWhereEq(client, 'budget_period_hospital_unit_budgets', 'period_name', pn, HU_BUDGET_SELECT).catch(
          () => [],
        ),
      ]);
      categoryBudgets = allCatBudgets || [];
      archetypeBudgets = (allArchBudgets || []) as any[];
      hospitalUnitBudgets = (allHuBudgets || []) as any[];
    } catch {
      categoryBudgets = [];
    }
  }

  const archetypeBudgetMap = new Map<string, Map<string, number>>();
  archetypeBudgets?.forEach((ab: any) => {
    if (!archetypeBudgetMap.has(ab.archetype_id)) {
      archetypeBudgetMap.set(ab.archetype_id, new Map());
    }
    archetypeBudgetMap.get(ab.archetype_id)!.set(ab.budget_category_id, Number(ab.budget_plan || 0));
  });

  const hospitalUnitBudgetMap = new Map<string, Map<string, number>>();
  hospitalUnitBudgets?.forEach((hu: any) => {
    if (!hospitalUnitBudgetMap.has(hu.hospital_unit_id)) {
      hospitalUnitBudgetMap.set(hu.hospital_unit_id, new Map());
    }
    hospitalUnitBudgetMap.get(hu.hospital_unit_id)!.set(hu.budget_category_id, Number(hu.budget_plan || 0));
  });

  const budgetData: Record<string, any> = {};
  categoryBudgets.forEach((cb: any) => {
    budgetData[cb.budget_category_id] = {
      budgetPlan: cb.budget_plan,
      budgetCarryForward: cb.budget_carry_forward,
      budgetAllocated: cb.budget_allocated,
      approvedBudget: cb.approved_budget,
      consumedBudget: cb.consumed_budget,
      assetCount: cb.asset_count,
      noBudgetAssetCount: cb.no_budget_asset_count,
    };
  });

  const [allHUs, allArchetypes, periodProjects] = await Promise.all([
    fetchAllRecords(client, 'hospital_units_config', HU_SELECT).catch(() =>
      fetchAllRecords(client, 'hospital_units_config', 'id,name,code,archetype_id'),
    ),
    fetchAllRecords(client, 'archetypes_config', ARCHETYPE_SELECT),
    networkShell
      ? Promise.resolve([])
      : networkView && categoryId
        ? fetchNetworkProjectsForCategory(client, periodIdentifier, categoryId, projectSelect)
        : fetchProjectsForPeriod(client, periodIdentifier, {
            hospitalUnitId: scopedHuId || undefined,
            projectSelect,
          }),
  ]);

  const projectIds = periodProjects.map((p: any) => p.id);
  let allAssets: any[] = [];
  let projectCategoryBudgets: any[] = [];
  let pipelineItems: any[] = [];

  if (projectIds.length > 0) {
    if (networkView) {
      projectCategoryBudgets = await fetchRecordsInBatches(
        client,
        'project_category_budgets',
        'project_id',
        projectIds,
        PCB_SELECT,
      );
    } else if (fsView) {
      [allAssets, projectCategoryBudgets] = await Promise.all([
        fetchRecordsInBatches(client, 'assets', 'project_id', projectIds, assetSelect),
        fetchRecordsInBatches(client, 'project_category_budgets', 'project_id', projectIds, PCB_SELECT),
      ]);
    } else {
      [allAssets, projectCategoryBudgets, pipelineItems] = await Promise.all([
        fetchRecordsInBatches(client, 'assets', 'project_id', projectIds, assetSelect),
        fetchRecordsInBatches(client, 'project_category_budgets', 'project_id', projectIds, PCB_SELECT),
        fetchRecordsInBatches(client, 'project_pipeline_items', 'project_id', projectIds, PIPELINE_SELECT),
      ]);
    }
  }

  const assetsByProjectId = new Map<string, any[]>();
  for (const asset of allAssets || []) {
    const pid = String(asset.project_id);
    const list = assetsByProjectId.get(pid);
    if (list) list.push(asset);
    else assetsByProjectId.set(pid, [asset]);
  }

  const pcbByProjectId = new Map<string, any[]>();
  for (const pcb of projectCategoryBudgets || []) {
    const pid = String(pcb.project_id);
    const list = pcbByProjectId.get(pid);
    if (list) list.push(pcb);
    else pcbByProjectId.set(pid, [pcb]);
  }

  const pipelineByProjectId = new Map<string, any[]>();
  for (const pi of pipelineItems || []) {
    const pid = String(pi.project_id);
    const list = pipelineByProjectId.get(pid);
    if (list) list.push(pi);
    else pipelineByProjectId.set(pid, [pi]);
  }

  const archetypesMap = new Map<string, any>();

  allArchetypes?.forEach((arch: any) => {
    archetypesMap.set(arch.id, {
      id: arch.id,
      name: arch.name,
      budget: {} as Record<string, any>,
      units: [] as any[],
    });
  });

  const huMap = new Map<string, any>();
  allHUs?.forEach((hu: any) => {
    if (!archetypesMap.has(hu.archetype_id)) return;

    const huData = {
      id: hu.id,
      name: hu.name,
      code: hu.code,
      isPipeline: Boolean(hu.is_pipeline),
      budget: {} as Record<string, any>,
      projects: [] as any[],
    };
    huMap.set(hu.id, huData);

    const archetype = archetypesMap.get(hu.archetype_id);
    if (archetype) {
      archetype.units.push(huData);
    }
  });

  periodProjects.forEach((project: any) => {
    const hu = huMap.get(project.hospital_unit_id);
    if (!hu) return;

    const pid = String(project.id);
    const projectAssets = (assetsByProjectId.get(pid) || []).map((asset: any) => ({ ...toCamelCase(asset) }));

    const categoryBudgetPlan: Record<string, number> = {};
    pcbByProjectId.get(pid)?.forEach((pcb: any) => {
      categoryBudgetPlan[pcb.budget_category_id] = pcb.budget_plan;
    });

    const pipelineData =
      pipelineByProjectId.get(pid)?.map((pi: any) => ({
        roomId: pi.room_id,
        catalogueId: pi.catalogue_id,
        qty: pi.quantity,
      })) || [];

    const projectData: any = {
      ...toCamelCase(project),
      assets: projectAssets,
      categoryBudgetPlan: Object.keys(categoryBudgetPlan).length > 0 ? categoryBudgetPlan : undefined,
      pipelineData:
        !networkView && pipelineData.length > 0 ? pipelineData : undefined,
    };

    if (networkView) {
      projectData.budgetAllocated =
        Number(project.budget_allocated ?? projectData.budgetAllocated) || 0;
      projectData.consumedBudget =
        Number(project.consumed_budget ?? projectData.consumedBudget) || 0;
    } else {
      // Always derive project allocated/consumed from nested assets (DB columns can be stale).
      const assetPlanSum = projectAssets.reduce(
        (sum: number, a: any) => sum + (Number(a.budgetPlan) || 0),
        0,
      );
      const assetConsumedSum = projectAssets.reduce(
        (sum: number, a: any) => sum + (Number(a.consumedBudget) || 0),
        0,
      );
      projectData.budgetAllocated = assetPlanSum;
      projectData.consumedBudget = assetConsumedSum;
    }
    if (projectData.isRoutineAssetAggregator) {
      const categoryPlanSum = Object.values(categoryBudgetPlan).reduce(
        (s: number, v) => s + (Number(v) || 0),
        0,
      );
      if (categoryPlanSum > 0) {
        projectData.budgetPlan = categoryPlanSum;
      }
      projectData.approvedBudget = projectData.budgetPlan;
    }

    hu.projects.push(projectData);
  });

  if (fsView) {
    return {
      ...toCamelCase(period),
      budget: budgetData,
      archetypes: Array.from(archetypesMap.values()),
    };
  }

  archetypesMap.forEach((archetype) => {
    const categoryIds = Object.keys(budgetData);
    categoryIds.forEach((catId) => {
      const manualBudgetPlan = archetypeBudgetMap.get(archetype.id)?.get(catId);

      archetype.budget[catId] = {
        budgetPlan: manualBudgetPlan || 0,
        budgetCarryForward: 0,
        budgetAllocated: 0,
        approvedBudget: 0,
        consumedBudget: 0,
        assetCount: 0,
        noBudgetAssetCount: 0,
      };
    });

    archetype.units.forEach((unit: any) => {
      categoryIds.forEach((catId) => {
        const manualHuBudgetPlan = hospitalUnitBudgetMap.get(unit.id)?.get(catId);

        unit.budget[catId] = {
          budgetPlan: manualHuBudgetPlan || 0,
          budgetCarryForward: 0,
          budgetAllocated: 0,
          approvedBudget: 0,
          consumedBudget: 0,
          assetCount: 0,
          noBudgetAssetCount: 0,
        };
      });

      unit.projects.forEach((proj: any) => {
        if (proj.isRoutineAssetAggregator) {
          // Routine: allocate plan/approved by categoryBudgetPlan; consume by asset category.
          for (const catId of categoryIds) {
            if (!unit.budget[catId]) continue;
            const routinePlan = Number(proj.categoryBudgetPlan?.[catId]) || 0;
            if (!hospitalUnitBudgetMap.get(unit.id)?.get(catId)) {
              unit.budget[catId].budgetPlan += routinePlan;
            }
            unit.budget[catId].budgetAllocated += routinePlan;
            unit.budget[catId].approvedBudget += routinePlan;
            const routineConsumed = networkView
              ? routineCategoryConsumedFromProject(proj, catId)
              : (proj.assets || [])
                  .filter((a: any) => a.budgetCategoryId === catId)
                  .reduce((s: number, a: any) => s + (Number(a.consumedBudget) || 0), 0);
            unit.budget[catId].consumedBudget += routineConsumed;
            if (!networkView) {
              unit.budget[catId].assetCount += (proj.assets || []).filter(
                (a: any) => a.budgetCategoryId === catId,
              ).length;
            }
          }
          return;
        }

        const catId = proj.budgetCategoryId;
        if (!catId || !unit.budget[catId]) return;

        const manualHuBudgetPlan = hospitalUnitBudgetMap.get(unit.id)?.get(catId);
        if (!manualHuBudgetPlan) {
          unit.budget[catId].budgetPlan += Number(proj.budgetPlan) || 0;
        }
        unit.budget[catId].budgetCarryForward += Number(proj.budgetCarryForward) || 0;
        // HU "allocated" = sum of child project plans (not asset plans).
        unit.budget[catId].budgetAllocated += Number(proj.budgetPlan) || 0;
        unit.budget[catId].approvedBudget += Number(proj.approvedBudget) || 0;
        unit.budget[catId].consumedBudget += Number(proj.consumedBudget) || 0;
        if (!networkView) {
          unit.budget[catId].assetCount += proj.assets?.length || 0;
        }
      });

      categoryIds.forEach((catId) => {
        if (archetype.budget[catId] && unit.budget[catId]) {
          const manualBudgetPlan = archetypeBudgetMap.get(archetype.id)?.get(catId);
          if (!manualBudgetPlan) {
            archetype.budget[catId].budgetPlan += unit.budget[catId].budgetPlan;
          }
          archetype.budget[catId].budgetCarryForward += unit.budget[catId].budgetCarryForward;
          archetype.budget[catId].budgetAllocated += unit.budget[catId].budgetAllocated;
          archetype.budget[catId].approvedBudget += unit.budget[catId].approvedBudget;
          archetype.budget[catId].consumedBudget += unit.budget[catId].consumedBudget;
          archetype.budget[catId].assetCount += unit.budget[catId].assetCount;
        }
      });
    });
  });

  return {
    ...toCamelCase(period),
    budget: budgetData,
    archetypes: Array.from(archetypesMap.values()),
  };
}

/** Master HU/archetype tree for App-shell dropdowns — no projects or assets. */
export async function loadBudgetPeriodStructureOnly(
  client: SupabaseClient,
  periodName: string,
): Promise<{ archetypes: any[] } | null> {
  const { data: period, error: periodError } = await client
    .from('budget_periods')
    .select('period_name')
    .eq('period_name', periodName)
    .maybeSingle();

  if (periodError && periodError.code !== 'PGRST116') {
    throw new Error(periodError.message);
  }
  if (!period) return null;

  const [allHUs, allArchetypes] = await Promise.all([
    fetchAllRecords(client, 'hospital_units_config', HU_SELECT).catch(() =>
      fetchAllRecords(client, 'hospital_units_config', 'id,name,code,archetype_id'),
    ),
    fetchAllRecords(client, 'archetypes_config', ARCHETYPE_SELECT),
  ]);

  const archetypesMap = new Map<string, any>();
  allArchetypes?.forEach((arch: any) => {
    archetypesMap.set(arch.id, {
      id: arch.id,
      name: arch.name,
      budget: {},
      units: [] as any[],
    });
  });

  allHUs?.forEach((hu: any) => {
    if (!archetypesMap.has(hu.archetype_id)) return;
    const huData = {
      id: hu.id,
      name: hu.name,
      code: hu.code,
      isPipeline: Boolean(hu.is_pipeline),
      budget: {},
      projects: [] as any[],
    };
    const archetype = archetypesMap.get(hu.archetype_id);
    if (archetype) archetype.units.push(huData);
  });

  return { archetypes: Array.from(archetypesMap.values()) };
}
