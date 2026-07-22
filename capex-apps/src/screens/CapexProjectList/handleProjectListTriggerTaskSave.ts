import type {
  EnrichedAsset,
  Project,
  SystemTriggerEvent,
  Task,
  User,
  UserRole,
} from '@/types';
import { FINAL_FS_APPROVAL_CONCLUSIONS, type FSConclusion } from '@/types';
import { isCapexBeConfigured, postToCapexBe } from '@/lib/capexBeClient';
import { saveProjectViaBackend } from '@/services/capexCrudApi';
import {
  completeWorkflowTaskViaBe,
  resolveMyTasksAccessToken,
  upsertFsApprovalViaBe,
} from '@/services/myTasksApi';
import type { PoAssetSavePatch } from '@/services/poUpdateApi';
import { getAccessTokenForBackend } from '@/lib/authSession';
import * as taskService from '@/services/taskService';
import { poDateToTaskCompletedAt } from '@/screens/POUpdatePage/poUpdateHelpers';

function toPoAssetPatch(asset: EnrichedAsset): PoAssetSavePatch {
  return {
    id: String(asset.id),
    projectId: String(asset.projectId),
    poNumber: asset.poNumber ?? null,
    cprId: asset.cprId ?? null,
    poDate: asset.poDate ?? null,
    consumedBudget: asset.consumedBudget,
    isGoodsReceived: asset.isGoodsReceived,
    assetCode: asset.assetCode,
    assetName: asset.assetName,
    description: asset.description,
    budgetPlan: asset.budgetPlan,
    budgetAllocated: asset.budgetAllocated,
    workflowSetId: asset.workflowSetId,
    budgetCategoryId: asset.budgetCategoryId,
    endTargetDate: asset.endTargetDate ?? null,
    catalogueId: asset.catalogueId ?? null,
    bddPriority: asset.bddPriority ?? null,
    assetTypeId: asset.assetTypeId ?? null,
    qty: asset.qty,
    receivedQty: asset.receivedQty,
    lifecycleStatus: asset.lifecycleStatus ?? null,
  };
}

async function savePoAssetViaBe(userId: number, asset: EnrichedAsset): Promise<void> {
  if (!isCapexBeConfigured()) {
    throw new Error('Backend tidak dikonfigurasi (NEXT_PUBLIC_CAPEXBE_URL).');
  }
  const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
  await postToCapexBe<{ ok?: boolean }>(
    '/po-update/save',
    { userId, assets: [toPoAssetPatch(asset)] },
    accessToken,
  );
}

export type ProjectListTriggerTaskSaveParams = {
  asset: EnrichedAsset;
  project: Project;
  task: Task;
  activeTriggerEvents: SystemTriggerEvent[];
  triggerDataByEvent: Partial<Record<SystemTriggerEvent, Record<string, unknown>>>;
  remark: string;
  assignedRole: UserRole;
  currentUser: User;
  periodName: string;
};

function applyTriggerPatches(
  asset: EnrichedAsset,
  project: Project,
  activeTriggerEvents: SystemTriggerEvent[],
  triggerDataByEvent: Partial<Record<SystemTriggerEvent, Record<string, unknown>>>,
): { asset: EnrichedAsset; project: Project } {
  let nextAsset = { ...asset };
  let nextProject = { ...project } as Project & { fsStatus?: string };

  for (const event of activeTriggerEvents) {
    const data = triggerDataByEvent[event];
    if (!data || Object.keys(data).length === 0) continue;

    switch (event) {
      case 'BUDGET_APPROVED':
        if (data.approvedBudget !== undefined) {
          nextProject = { ...nextProject, approvedBudget: Number(data.approvedBudget) || 0 };
        }
        break;
      case 'PO_CREATED':
      case 'PO_GOODS_RECEIVED':
      case 'ASSET_BUDGET_PLAN_FILLED':
        if (data.consumedBudget !== undefined) {
          nextAsset = { ...nextAsset, consumedBudget: Number(data.consumedBudget) || 0 };
        }
        if (data.poNumber !== undefined) {
          nextAsset = { ...nextAsset, poNumber: String(data.poNumber ?? '').trim() || undefined };
        }
        if (data.poDate !== undefined) {
          const raw = String(data.poDate ?? '').trim();
          nextAsset = { ...nextAsset, poDate: raw || undefined };
        }
        if (data.isGoodsReceived !== undefined) {
          nextAsset = { ...nextAsset, isGoodsReceived: Boolean(data.isGoodsReceived) };
        }
        if (data.budgetPlan !== undefined) {
          nextAsset = { ...nextAsset, budgetPlan: Number(data.budgetPlan) || 0 };
        }
        if (event === 'PO_CREATED' && !nextAsset.poDate?.trim()) {
          const hasPoData =
            Boolean(nextAsset.poNumber?.trim()) || (nextAsset.consumedBudget ?? 0) > 0;
          if (hasPoData) {
            nextAsset = { ...nextAsset, poDate: new Date().toISOString().slice(0, 10) };
          }
        }
        break;
      case 'FS_APPROVAL':
        if (data.conclusion !== undefined) {
          nextProject = {
            ...nextProject,
            fsStatus: String(data.conclusion),
          };
        }
        break;
      default:
        break;
    }
  }

  return { asset: nextAsset, project: nextProject };
}

async function persistFsApproval(
  userId: number,
  project: Project,
  data: Record<string, unknown>,
): Promise<Project> {
  const conclusion = String(data.conclusion ?? '').trim();
  if (!FINAL_FS_APPROVAL_CONCLUSIONS.includes(conclusion as FSConclusion)) {
    throw new Error('FS Conclusion wajib diisi (Approved / Approved with Notes / Rejected).');
  }

  const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
  const result = await upsertFsApprovalViaBe({
    userId,
    accessToken,
    projectId: String(project.id),
    conclusion,
    amount: data.amount !== undefined ? Number(data.amount) || 0 : undefined,
    followUpAction:
      data.followUpAction === undefined
        ? undefined
        : data.followUpAction == null
          ? null
          : String(data.followUpAction),
    fsType: data.fsType !== undefined ? String(data.fsType) : undefined,
  });

  return {
    ...project,
    ...(result.fsStatus ? { fsStatus: result.fsStatus } : { fsStatus: conclusion }),
  } as Project;
}

async function persistTriggerData(
  userId: number,
  periodName: string,
  asset: EnrichedAsset,
  project: Project,
  activeTriggerEvents: SystemTriggerEvent[],
  triggerDataByEvent: Partial<Record<SystemTriggerEvent, Record<string, unknown>>>,
): Promise<{ asset: EnrichedAsset; project: Project }> {
  const savePeriodName = project.periodName?.trim() || periodName;
  let nextAsset = asset;
  let nextProject = project;

  const needsAssetSave = activeTriggerEvents.some((event) =>
    ['PO_CREATED', 'PO_GOODS_RECEIVED', 'ASSET_BUDGET_PLAN_FILLED'].includes(event),
  );
  const needsProjectSave = activeTriggerEvents.includes('BUDGET_APPROVED');
  const needsFsSave = activeTriggerEvents.includes('FS_APPROVAL');

  if (needsAssetSave) {
    await savePoAssetViaBe(userId, nextAsset);
  }

  if (needsProjectSave) {
    try {
      const backendSaved = await saveProjectViaBackend(userId, savePeriodName, nextProject);
      if (!backendSaved) {
        throw new Error(
          'Gagal menyimpan data proyek via backend (endpoint tidak tersedia). Restart capexbe lalu coba lagi.',
        );
      }
      nextProject = backendSaved;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan data proyek via backend.';
      throw new Error(msg);
    }
  }

  if (needsFsSave) {
    const fsData = triggerDataByEvent.FS_APPROVAL;
    if (!fsData || !String(fsData.conclusion ?? '').trim()) {
      throw new Error('FS Conclusion wajib diisi.');
    }
    nextProject = await persistFsApproval(userId, nextProject, fsData);
  }

  return { asset: nextAsset, project: nextProject };
}

function resolvePoTaskCompletedAt(
  activeTriggerEvents: SystemTriggerEvent[],
  triggerDataByEvent: Partial<Record<SystemTriggerEvent, Record<string, unknown>>>,
  asset: EnrichedAsset,
): string | undefined {
  if (!activeTriggerEvents.includes('PO_CREATED')) return undefined;
  const poDate =
    String(triggerDataByEvent.PO_CREATED?.poDate ?? '').trim() || asset.poDate?.trim() || '';
  return poDateToTaskCompletedAt(poDate);
}

async function completeWorkflowTask(
  params: ProjectListTriggerTaskSaveParams,
): Promise<void> {
  const { asset, task, remark, assignedRole, currentUser, activeTriggerEvents, triggerDataByEvent } =
    params;
  const completedAt = resolvePoTaskCompletedAt(activeTriggerEvents, triggerDataByEvent, asset);

  if (isCapexBeConfigured()) {
    const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
    try {
      const result = await completeWorkflowTaskViaBe({
        userId: currentUser.id,
        accessToken,
        assetId: String(asset.id),
        taskId: String(task.id),
        remark,
        roleId: assignedRole.id,
        completedAt,
      });
      if (result.success) return;
      throw new Error(result.message || 'Gagal menyelesaikan task via backend.');
    } catch (beErr) {
      console.warn('Complete workflow via BE failed, falling back:', beErr);
      const beMessage = beErr instanceof Error ? beErr.message : '';
      const result = await taskService.markTaskAsDone(
        String(asset.id),
        String(task.id),
        remark,
        currentUser,
        assignedRole,
        { completedAt },
      );
      if (!result.success) {
        throw new Error(beMessage || result.message || 'Gagal menyelesaikan task.');
      }
      return;
    }
  }

  const result = await taskService.markTaskAsDone(
    String(asset.id),
    String(task.id),
    remark,
    currentUser,
    assignedRole,
    { completedAt },
  );
  if (!result.success) {
    throw new Error(result.message || 'Gagal menyelesaikan task.');
  }
}

export async function handleProjectListTriggerTaskSave(
  params: ProjectListTriggerTaskSaveParams,
): Promise<{ asset: EnrichedAsset; project: Project }> {
  const { activeTriggerEvents, triggerDataByEvent, remark, currentUser } = params;

  if (!remark.trim()) {
    throw new Error('Remark wajib diisi.');
  }

  const poData = triggerDataByEvent.PO_CREATED;
  if (activeTriggerEvents.includes('PO_CREATED')) {
    const poNumber = String(poData?.poNumber ?? '').trim();
    const consumedBudget = Number(poData?.consumedBudget ?? 0);
    if (!poNumber && consumedBudget <= 0) {
      throw new Error('PO Number atau PO Value wajib diisi.');
    }
  }

  if (activeTriggerEvents.includes('PO_GOODS_RECEIVED')) {
    const gr = triggerDataByEvent.PO_GOODS_RECEIVED;
    if (!Boolean(gr?.isGoodsReceived)) {
      throw new Error('Centang Confirm Goods Received (GR) untuk menyelesaikan trigger PO Done.');
    }
  }

  if (activeTriggerEvents.includes('FS_APPROVAL')) {
    const conclusion = String(triggerDataByEvent.FS_APPROVAL?.conclusion ?? '').trim();
    if (!FINAL_FS_APPROVAL_CONCLUSIONS.includes(conclusion as FSConclusion)) {
      throw new Error('FS Conclusion wajib diisi (Approved / Approved with Notes / Rejected).');
    }
  }

  const patched = applyTriggerPatches(
    params.asset,
    params.project,
    activeTriggerEvents,
    triggerDataByEvent,
  );

  const persisted = await persistTriggerData(
    currentUser.id,
    params.periodName,
    patched.asset,
    patched.project,
    activeTriggerEvents,
    triggerDataByEvent,
  );

  await completeWorkflowTask({ ...params, asset: persisted.asset, project: persisted.project });

  return persisted;
}
