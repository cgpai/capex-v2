import { BadRequestException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  allocateNextAssetCode,
  allocateNextProjectCode,
  remapAssetCodePrefix,
  resolveAssetCodePrefix,
} from './budget-hu-code-alloc.util';

export { allocateNextAssetCode, allocateNextProjectCode, remapAssetCodePrefix, resolveAssetCodePrefix };

function truncateString(str: string | undefined | null, maxLength: number): string | null {
  if (!str) return null;
  return str.length > maxLength ? str.substring(0, maxLength) : str;
}

function newAssetId(): string {
  const uid =
    typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `ASSET-${uid}`.substring(0, 255);
}

function isRoutineCode(code: string): boolean {
  const parts = String(code ?? '').trim().split('.');
  return parts.length >= 3 && parts[2].toUpperCase() === 'RA';
}

export type PersistProjectResult = {
  id: string;
  projectCode: string;
  /** True when server assigned a different code than the client sent. */
  codeRemapped: boolean;
};

export type PersistAssetResult = {
  id: string;
  assetCode: string | null;
  codeRemapped: boolean;
};

export async function assertHuInUserScope(
  client: SupabaseClient,
  userId: number,
  huId: string,
): Promise<void> {
  const { data: hasAll, error: allErr } = await client.rpc('user_has_all_scope', {
    user_id_param: userId,
  });
  if (!allErr && hasAll === true) return;

  const { data: huIds, error } = await client.rpc('user_accessible_hu_ids', {
    user_id_param: userId,
  });
  if (error) throw new BadRequestException(error.message);
  const allowed = new Set((huIds || []).map((id: unknown) => String(id)));
  if (!allowed.has(huId)) {
    throw new BadRequestException('Hospital unit is outside your assignment scope');
  }
}

async function upsertProjectById(
  client: SupabaseClient,
  projectData: Record<string, unknown>,
): Promise<{ id: string; projectCode: string }> {
  let attempt = 0;
  const data = { ...projectData };
  while (attempt < 8) {
    const { data: savedRows, error } = await client
      .from('projects')
      .upsert(data, { onConflict: 'id' })
      .select('id, project_code');

    if (!error) {
      const savedId =
        (Array.isArray(savedRows) && savedRows[0]?.id ? String(savedRows[0].id) : null) ||
        String(data.id);
      const projectCode = String(
        (Array.isArray(savedRows) && savedRows[0]?.project_code) || data.project_code || '',
      );
      projectData.project_code = projectCode;
      projectData.id = savedId;
      return { id: savedId, projectCode };
    }

    // Unique violation on project_code — reallocate and retry (concurrent create race).
    if (error.code === '23505') {
      const code = String(data.project_code ?? '');
      const parts = code.split('.');
      const huCode = parts[0] || '';
      const yy = parts[1] || '';
      if (huCode && yy && !isRoutineCode(code)) {
        data.project_code = await allocateNextProjectCode(
          client,
          huCode,
          yy,
          null,
          null,
          { forceReserve: true },
        );
        attempt += 1;
        continue;
      }
    }
    throw new BadRequestException(`saveProject: ${error.message}`);
  }
  throw new BadRequestException('saveProject: exhausted retries allocating unique project_code');
}

/**
 * Persist a project without overwriting a different project's row via project_code collision.
 * Concurrent creates with the same client-generated code get remapped to the next free code.
 */
export async function persistProjectRow(
  client: SupabaseClient,
  project: Record<string, unknown>,
  hospitalUnitId: string,
  periodName: string,
): Promise<PersistProjectResult> {
  const requestedCode = truncateString(String(project.projectCode ?? ''), 100) || '';
  const projectData: Record<string, unknown> = {
    id: truncateString(String(project.id ?? ''), 255) || String(project.id).substring(0, 255),
    asset_code: truncateString(String(project.assetCode ?? ''), 100),
    ax_code: truncateString(String(project.axCode ?? ''), 100),
    project_name: truncateString(String(project.projectName ?? ''), 255) || '',
    asset_name: truncateString(String(project.assetName ?? ''), 255),
    project_code: requestedCode,
    completion_rate: project.completionRate ?? null,
    task_to_do: project.taskToDo ?? null,
    owner: truncateString(String(project.owner ?? ''), 255),
    target_start: project.targetStart ?? null,
    end_date: project.endDate ?? null,
    status: project.status ?? null,
    plan: truncateString(String(project.plan ?? ''), 50),
    budget_plan: Number(project.budgetPlan ?? 0),
    budget_carry_forward: Number(project.budgetCarryForward ?? 0),
    budget_allocated: Number(project.budgetAllocated ?? 0),
    approved_budget: Number(project.approvedBudget ?? 0),
    consumed_budget: Number(project.consumedBudget ?? 0),
    revenue_projection: project.revenueProjection ?? null,
    target_budget_start: project.targetBudgetStart ?? null,
    budget_revenue_permonth: Number(project.budgetRevenuePermonth ?? 0),
    priority_id:
      truncateString(String(project.priorityId ?? ''), 255) ||
      String(project.priorityId ?? '').substring(0, 255),
    type: truncateString(String(project.type ?? ''), 100) || String(project.type ?? '').substring(0, 100),
    budget_category_id:
      truncateString(String(project.budgetCategoryId ?? ''), 255) ||
      String(project.budgetCategoryId ?? '').substring(0, 255),
    hospital_unit_id: truncateString(hospitalUnitId, 255) || hospitalUnitId.substring(0, 255),
    period_name: periodName || null,
    is_routine_asset_aggregator: Boolean(project.isRoutineAssetAggregator ?? false),
    is_pipeline_project: Boolean(project.isPipelineProject ?? false),
    stage: project.stage ?? null,
  };

  const { data: existingById } = await client
    .from('projects')
    .select('id, project_code')
    .eq('id', projectData.id)
    .maybeSingle();

  const parts = String(projectData.project_code || '').split('.');
  const huCode = parts[0] || '';
  const yy = parts[1] || '';
  const isRoutine = Boolean(project.isRoutineAssetAggregator) || isRoutineCode(String(projectData.project_code));

  if (existingById?.id) {
    // Update known row by id — keep code when free; never steal another project's code.
    if (huCode && yy) {
      projectData.project_code = await allocateNextProjectCode(
        client,
        huCode,
        yy,
        String(projectData.project_code),
        String(projectData.id),
        { forceReserve: false },
      );
    }
  } else if (isRoutine && huCode && yy) {
    // Singleton RA aggregator: fold concurrent creates into the existing RA row.
    const raCode = `${huCode}.${yy}.RA`;
    const { data: existingRa } = await client
      .from('projects')
      .select('id')
      .eq('project_code', raCode)
      .maybeSingle();
    if (existingRa?.id) {
      projectData.id = String(existingRa.id);
      projectData.project_code = raCode;
    } else {
      projectData.project_code = raCode;
    }
  } else if (huCode && yy) {
    // New project: always mint from atomic sequence (ignore client-preferred — races across browsers).
    projectData.project_code = await allocateNextProjectCode(
      client,
      huCode,
      yy,
      null,
      null,
      { forceReserve: true },
    );
  }

  const { id: savedId, projectCode: actualCode } = await upsertProjectById(client, projectData);

  const categoryBudgetPlan = project.categoryBudgetPlan as Record<string, number> | undefined;
  if (categoryBudgetPlan && Object.keys(categoryBudgetPlan).length > 0) {
    const categoryBudgets = Object.entries(categoryBudgetPlan).map(([categoryId, budgetPlan]) => ({
      project_id: savedId,
      budget_category_id: categoryId,
      budget_plan: budgetPlan,
    }));
    const { error: catErr } = await client
      .from('project_category_budgets')
      .upsert(categoryBudgets, { onConflict: 'project_id,budget_category_id' });
    if (catErr) throw new BadRequestException(`saveProject category budgets: ${catErr.message}`);
  }

  return {
    id: savedId,
    projectCode: actualCode,
    codeRemapped: actualCode !== requestedCode,
  };
}

type PipelineDataRow = {
  roomId?: string;
  catalogueId?: string;
  qty?: number;
};

/** Replace all pipeline planner rows for a project (mirrors db-supabase saveProject). */
export async function persistPipelineItems(
  client: SupabaseClient,
  projectId: string,
  pipelineData: PipelineDataRow[] | undefined,
  hospitalUnitId: string,
  archetypeId?: string | null,
): Promise<void> {
  const pid = String(projectId).trim();
  if (!pid) return;

  const { error: deleteErr } = await client.from('project_pipeline_items').delete().eq('project_id', pid);
  if (deleteErr) throw new BadRequestException(`savePipelineItems delete: ${deleteErr.message}`);

  const rows = (pipelineData ?? [])
    .map((item) => ({
      project_id: pid,
      room_id: String(item.roomId ?? '').trim(),
      catalogue_id: String(item.catalogueId ?? '').trim(),
      quantity: Math.max(0, Number(item.qty) || 0),
      hospital_unit_id: hospitalUnitId || null,
      archetype_id: archetypeId ? String(archetypeId) : null,
    }))
    .filter((row) => row.room_id && row.catalogue_id && row.quantity > 0);

  if (rows.length === 0) return;

  const { error: insertErr } = await client.from('project_pipeline_items').insert(rows);
  if (insertErr) throw new BadRequestException(`savePipelineItems insert: ${insertErr.message}`);
}

export async function persistAssetRow(
  client: SupabaseClient,
  asset: Record<string, unknown>,
  projectId: string,
  projectCodeHint?: string,
): Promise<PersistAssetResult> {
  let workflowSetId = String(asset.workflowSetId ?? '').trim();
  if (!workflowSetId) {
    const { data: firstWorkflow, error: workflowError } = await client
      .from('workflow_sets')
      .select('id')
      .limit(1)
      .maybeSingle();
    if (workflowError || !firstWorkflow?.id) {
      throw new BadRequestException(
        `Cannot save asset ${String(asset.id)}: workflow_set_id is required and no default workflow exists`,
      );
    }
    workflowSetId = String(firstWorkflow.id);
  } else {
    const { data: workflowExists } = await client
      .from('workflow_sets')
      .select('id')
      .eq('id', workflowSetId)
      .maybeSingle();
    if (!workflowExists?.id) {
      const { data: firstWorkflow } = await client.from('workflow_sets').select('id').limit(1).maybeSingle();
      if (!firstWorkflow?.id) {
        throw new BadRequestException(`Invalid workflow_set_id for asset ${String(asset.id)}`);
      }
      workflowSetId = String(firstWorkflow.id);
    }
  }

  const orderedQty = Number(asset.qty ?? 1);
  const receivedQty = Number(asset.receivedQty ?? 0);
  const isGoodsReceived = receivedQty === orderedQty && receivedQty > 0;

  let requestedCode = asset.assetCode == null ? null : String(asset.assetCode);
  let projectCode = String(projectCodeHint ?? '').trim();
  if (!projectCode) {
    const { data: proj } = await client
      .from('projects')
      .select('project_code')
      .eq('id', projectId)
      .maybeSingle();
    projectCode = String(proj?.project_code ?? '').trim();
  }

  const { data: existingById } = await client
    .from('assets')
    .select('id, asset_code')
    .eq('id', String(asset.id))
    .maybeSingle();

  let assetId = String(asset.id);

  if (!existingById?.id) {
    // New asset — always reserve unique sequence (ignore client preferred to avoid browser races).
    if (projectCode) {
      requestedCode = await allocateNextAssetCode(client, projectCode, null, null, {
        forceReserve: true,
      });
    }
  } else if (projectCode) {
    requestedCode = await allocateNextAssetCode(
      client,
      projectCode,
      requestedCode,
      String(existingById.id),
      { forceReserve: false },
    );
    assetId = String(existingById.id);
  }

  let assetData: Record<string, unknown> = {
    id: assetId,
    asset_code: requestedCode,
    asset_name: asset.assetName ?? '',
    description: asset.description ?? null,
    project_id: projectId,
    budget_plan: Number(asset.budgetPlan ?? 0),
    budget_allocated: Number(asset.budgetAllocated ?? 0),
    consumed_budget: Number(asset.consumedBudget ?? 0),
    workflow_set_id: workflowSetId,
    budget_category_id: asset.budgetCategoryId ?? null,
    end_target_date: asset.endTargetDate ?? null,
    catalogue_id: asset.catalogueId ?? null,
    po_number: asset.poNumber ?? null,
    cpr_id: asset.cprId == null ? null : String(asset.cprId).trim() || null,
    po_date: asset.poDate == null ? null : String(asset.poDate).slice(0, 10) || null,
    is_goods_received: isGoodsReceived,
    bdd_priority: asset.bddPriority ?? null,
    asset_type_id: asset.assetTypeId ?? null,
    qty: orderedQty,
    received_qty: receivedQty,
    lifecycle_status:
      asset.lifecycleStatus == null || String(asset.lifecycleStatus).trim() === ''
        ? null
        : String(asset.lifecycleStatus).trim(),
  };

  let attempt = 0;
  while (attempt < 8) {
    let { error } = await client.from('assets').upsert(assetData, { onConflict: 'id' });
    if (!error) {
      const original = asset.assetCode == null ? null : String(asset.assetCode);
      const finalCode = assetData.asset_code == null ? null : String(assetData.asset_code);
      return {
        id: String(assetData.id),
        assetCode: finalCode,
        codeRemapped: (original || '') !== (finalCode || ''),
      };
    }
    if (error.code === '23505') {
      // Unique on id or asset_code — regen id and/or code then retry.
      if (String(error.message || '').toLowerCase().includes('asset_code') && projectCode) {
        assetData.asset_code = await allocateNextAssetCode(
          client,
          projectCode,
          null,
          String(assetData.id),
        );
      } else {
        assetData = { ...assetData, id: newAssetId() };
        if (projectCode) {
          assetData.asset_code = await allocateNextAssetCode(
            client,
            projectCode,
            String(assetData.asset_code ?? ''),
            String(assetData.id),
          );
        }
      }
      attempt += 1;
      continue;
    }
    throw new BadRequestException(`saveAsset: ${error.message}`);
  }
  throw new BadRequestException('saveAsset: exhausted retries allocating unique asset_code');
}

/** Persist pipeline purchase order + line items (service role on backend). */
export async function persistPurchaseOrderRow(
  client: SupabaseClient,
  po: Record<string, unknown>,
): Promise<void> {
  const projectId = String(po.projectId ?? po.project_id ?? '').trim();
  if (!projectId) throw new BadRequestException('purchaseOrder.projectId is required');

  const { data: existingProject, error: projectErr } = await client
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle();
  if (projectErr) throw new BadRequestException(`savePurchaseOrder project check: ${projectErr.message}`);
  if (!existingProject?.id) {
    throw new BadRequestException(
      `Project "${projectId}" not found. Save the pipeline project before creating a PO.`,
    );
  }

  const poId = String(po.id ?? '').trim();
  if (!poId) throw new BadRequestException('purchaseOrder.id is required');

  const poData = {
    id: poId,
    po_number: String(po.poNumber ?? po.po_number ?? '').trim(),
    project_id: projectId,
    stage: Number(po.stage ?? 0),
    vendor_id: String(po.vendorId ?? po.vendor_id ?? '').trim(),
    vendor_name: String(po.vendorName ?? po.vendor_name ?? '').trim(),
    total_value: Number(po.totalValue ?? po.total_value ?? 0),
    status: String(po.status ?? 'Active').trim(),
    shipping_address: po.shippingAddress ?? po.shipping_address ?? null,
    remarks: po.remarks ?? null,
  };

  const { data: savedPo, error: poError } = await client
    .from('purchase_orders')
    .upsert(poData, { onConflict: 'id' })
    .select('id')
    .single();
  if (poError) throw new BadRequestException(`savePurchaseOrder: ${poError.message}`);

  const savedId = String(savedPo?.id ?? poId);
  const { error: deleteErr } = await client
    .from('purchase_order_items')
    .delete()
    .eq('purchase_order_id', savedId);
  if (deleteErr) throw new BadRequestException(`savePurchaseOrder items delete: ${deleteErr.message}`);

  const items = Array.isArray(po.items) ? po.items : [];
  if (items.length === 0) return;

  const rows = items.map((item: Record<string, unknown>) => ({
    purchase_order_id: savedId,
    catalogue_id: String(item.catalogueId ?? item.catalogue_id ?? '').trim(),
    rds_code: String(item.rdsCode ?? item.rds_code ?? '').trim(),
    name: String(item.name ?? '').trim(),
    quantity: Number(item.qty ?? item.quantity ?? 0),
    price: Number(item.price ?? 0),
    subtotal: Number(item.subtotal ?? 0),
    received_quantity: Number(item.receivedQty ?? item.received_quantity ?? 0),
    remarks: item.remarks ?? null,
  }));

  const { error: insertErr } = await client.from('purchase_order_items').insert(rows);
  if (insertErr) throw new BadRequestException(`savePurchaseOrder items insert: ${insertErr.message}`);
}

export async function deleteAssetCascade(client: SupabaseClient, assetId: string): Promise<void> {
  await client.from('asset_task_statuses').delete().eq('asset_id', assetId);
  await client.from('task_logs').delete().eq('asset_id', assetId);
  await client.from('moms').delete().eq('asset_id', assetId);
  await client.from('adhoc_tasks').delete().eq('asset_id', assetId);
  const { error } = await client.from('assets').delete().eq('id', assetId);
  if (error) throw new BadRequestException(`deleteAsset: ${error.message}`);
}

export async function deleteProjectCascade(client: SupabaseClient, projectId: string): Promise<void> {
  const { data: assets } = await client.from('assets').select('id').eq('project_id', projectId);
  for (const asset of assets || []) {
    const assetId = String((asset as { id: string }).id);
    await client.from('asset_task_statuses').delete().eq('asset_id', assetId);
    await client.from('task_logs').delete().eq('asset_id', assetId);
    await client.from('moms').delete().eq('asset_id', assetId);
    await client.from('adhoc_tasks').delete().eq('asset_id', assetId);
    await client.from('assets').delete().eq('id', assetId);
  }
  await client.from('project_category_budgets').delete().eq('project_id', projectId);
  await client.from('project_pipeline_items').delete().eq('project_id', projectId);
  await client.from('feasibility_studies').delete().eq('project_id', projectId);
  const { error } = await client.from('projects').delete().eq('id', projectId);
  if (error) throw new BadRequestException(`deleteProject: ${error.message}`);
}
