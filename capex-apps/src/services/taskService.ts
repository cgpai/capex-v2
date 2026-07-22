const _log = (..._args: unknown[]) => {};
const _warn = (..._args: unknown[]) => {};

import { USE_MOCK } from '../lib/config';
import { withRequestCache } from '../lib/requestCache';
import { getCurrentAppUserIdFromSession } from '../features/configuration/shared/configSession';
import {
    recalculateAssetViaBackend,
    rescheduleTaskViaBackend,
    saveAdhocTaskViaBackend,
    saveMomViaBackend,
    triggerSystemTaskBatchViaBackend,
    triggerSystemTaskViaBackend,
    updateSlaOverrideViaBackend,
    fetchAssetTaskStatusesForAssetFromBackend,
    fetchAssetTaskStatusesForAssetIdsFromBackend,
    fetchTaskLogsForAssetFromBackend,
    fetchTaskLogsForAssetIdsFromBackend,
    fetchMomsForAssetFromBackend,
} from './taskActionsApi';
import {
    User,
    EnrichedAsset,
    WorkflowSet,
    Task,
    AssetTaskStatus,
    TaskLog,
    TaskCurrentStatus,
    UserRole,
    WorkflowStep,
    MOM,
    AdhocTask,
    AdhocTaskStatus,
    TimelineItem,
    WorkflowTaskDetail,
    MOMDetail,
    AdhocTaskDetail,
    UserTask,
    SystemTriggerEvent,
    AuditLogDetail,
    BudgetPeriod,
    DailyMOMSummaryRow,
} from '../types';
import * as configService from './configService';
import * as budgetService from './budgetService';
import * as auditService from './auditService';
import { getEffectiveSlaDays } from '../lib/workflowRolePolicy';
import { fetchAssetTimelineFromBe } from './assetTimelineApi';
import {
    completeAdhocTaskViaBe,
    completeWorkflowTaskViaBe,
    isCapexBeConfigured,
    fetchMyTasks,
    reportNotYetDoneViaBe,
    resolveMyTasksAccessToken,
    revertTaskViaBe,
    updateTaskRemarkViaBe,
    withdrawReportViaBe,
} from './myTasksApi';
import { getAccessTokenForBackend } from '../lib/authSession';
import type { UserScopesForCapex } from '../lib/capexProjectListScope';
import {
    assetTimelineCacheKey,
    getAssetTimelineInflight,
    getCachedAssetTimeline,
    setAssetTimelineInflight,
    setCachedAssetTimeline,
} from '../lib/assetTimelineCache';
import { taskHasTriggerEvent } from '../lib/systemTriggerEvents';
import {
    buildScopeResolutionMaps,
    isAssetInUserUnionScope,
    isWorkflowStepAssignedToUser,
} from '../lib/taskAssignmentScope';

/**
 * Triggers a system-defined task to be automatically completed.
 * @param options.completedAt ISO datetime for task log (e.g. from asset.poDate for PO_CREATED).
 */
export const triggerSystemTask = async (
  assetId: string,
  triggerEvent: SystemTriggerEvent,
  user: User,
  options?: { completedAt?: string },
) => {
    const triggered = await triggerSystemTaskViaBackend({
        userId: user.id,
        assetId,
        triggerEvent,
        completedAt: options?.completedAt,
    });
    if (triggered) {
        await recalculateAssetTaskStatuses(assetId);
    }
};

export const triggerSystemTaskBatch = async (assetIds: string[], triggerEvent: SystemTriggerEvent, user: User) => {
    if (assetIds.length === 0) return;
    const batched = await triggerSystemTaskBatchViaBackend({
        userId: user.id,
        assetIds,
        triggerEvent,
    });
    if (!batched) return;
    const BATCH = 20;
    for (let i = 0; i < assetIds.length; i += BATCH) {
        const batch = assetIds.slice(i, i + BATCH);
        await Promise.all(batch.map((assetId) => recalculateAssetTaskStatuses(assetId).catch(() => null)));
    }
};
const normTaskId = (id: string | number | undefined): string => (id == null ? '' : String(id));

/**
 * Recalculates and updates the statuses of all tasks for a given asset based on its workflow and current completion state.
 * Task Open/Locked ditentukan oleh trigger: jika task sebelumnya (atau triggering task) sudah Done, task jadi Open.
 * Sumber kebenaran Done = asset_task_statuses (status Done) + task_logs (termasuk selesai via Smart Migration).
 */
export const recalculateAssetTaskStatuses = async (assetId: string) => {
    const uid = getCurrentAppUserIdFromSession();
    if (uid == null) return;
    await recalculateAssetViaBackend(uid, assetId);
};


/**
 * Marks a task as done, creating a log entry and triggering status recalculation.
 * Allows completion of tasks anytime as long as they are not already Done.
 * @returns An object indicating success or failure with a message.
 */
export const markTaskAsDone = async (
    assetId: string,
    taskId: string,
    remark: string,
    user: User,
    assignedRole: UserRole,
    options?: { completedAt?: string },
): Promise<{ success: boolean; message: string }> => {
    if (!remark.trim()) {
        return { success: false, message: 'A remark is required to complete the task.' };
    }
    if (!isCapexBeConfigured()) {
        return { success: false, message: 'Backend is not configured.' };
    }
    try {
        const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
        return await completeWorkflowTaskViaBe({
            userId: user.id,
            accessToken,
            assetId,
            taskId,
            remark,
            roleId: assignedRole.id,
            completedAt: options?.completedAt,
        });
    } catch (beErr) {
        const beMessage = beErr instanceof Error ? beErr.message : 'Task completion failed';
        return { success: false, message: beMessage };
    }
};

export const rescheduleTask = async (
    assetId: string,
    taskId: string,
    days: number,
    reason: string,
    user: User
): Promise<{ success: boolean; message: string }> => {
    const beResult = await rescheduleTaskViaBackend({ userId: user.id, assetId, taskId, days, reason });
    if (beResult) return beResult;
    return { success: false, message: 'Backend reschedule failed.' };
};

/**
 * Sets or clears per-asset SLA override on a workflow task status row.
 * Does not change the workflow default SLA in Configuration.
 */
export const updateAssetTaskSlaOverride = async (
    assetId: string,
    taskId: string,
    slaDays: number | null,
): Promise<{ success: boolean; message: string }> => {
    const uid = getCurrentAppUserIdFromSession();
    if (uid == null) return { success: false, message: 'No user session.' };
    const beResult = await updateSlaOverrideViaBackend({ userId: uid, assetId, taskId, slaDays });
    if (beResult) return beResult;
    return { success: false, message: 'Backend SLA update failed.' };
};

const isSuperAdmin = (user: User): boolean =>
    user.assignments?.some(
        (a) =>
            String(a.roleName ?? '')
                .trim()
                .toLowerCase()
                .replace(/\s+/g, ' ') === 'super admin'
    ) ?? false;

export const revertTaskToOpen = async (assetId: string, taskId: string, user: User): Promise<{ success: boolean; message: string }> => {
    if (!isCapexBeConfigured()) return { success: false, message: 'Backend is not configured.' };
    try {
        const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
        return await revertTaskViaBe({ userId: user.id, accessToken, assetId: String(assetId), taskId: String(taskId) });
    } catch (beErr) {
        return { success: false, message: beErr instanceof Error ? beErr.message : 'Backend revert failed.' };
    }
};

export const reportTaskNotYetDone = async (assetId: string, taskId: string, user: User): Promise<{ success: boolean; message: string }> => {
    if (!isCapexBeConfigured()) return { success: false, message: 'Backend is not configured.' };
    try {
        const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
        return await reportNotYetDoneViaBe({ userId: user.id, accessToken, assetId: String(assetId), taskId: String(taskId) });
    } catch (beErr) {
        return { success: false, message: beErr instanceof Error ? beErr.message : 'Backend report failed.' };
    }
};

export const withdrawReportNotYetDone = async (assetId: string, taskId: string, user: User): Promise<{ success: boolean; message: string }> => {
    if (!isCapexBeConfigured()) return { success: false, message: 'Backend is not configured.' };
    try {
        const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
        return await withdrawReportViaBe({ userId: user.id, accessToken, assetId: String(assetId), taskId: String(taskId) });
    } catch (beErr) {
        return { success: false, message: beErr instanceof Error ? beErr.message : 'Backend withdraw failed.' };
    }
};

export const updateTaskRemark = async (
    assetId: string,
    taskId: string,
    remark: string,
    user: User,
): Promise<{ success: boolean; message: string; remark?: string; remarkEditHistory?: TaskLog['remarkEditHistory'] }> => {
    const trimmed = remark.trim();
    if (!trimmed) return { success: false, message: 'Remark wajib diisi.' };
    if (!isCapexBeConfigured()) return { success: false, message: 'Backend is not configured.' };
    try {
        const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
        return await updateTaskRemarkViaBe({ userId: user.id, accessToken, assetId: String(assetId), taskId: String(taskId), remark: trimmed });
    } catch (beErr) {
        return { success: false, message: beErr instanceof Error ? beErr.message : 'Backend remark update failed.' };
    }
};

export const getTasksForUser = async (user: User): Promise<UserTask[]> => {
    const uid = getCurrentAppUserIdFromSession() ?? user.id;
    const token = await resolveMyTasksAccessToken(getAccessTokenForBackend);
    return fetchMyTasks(uid, token);
};


export const getAssetTaskStatusesForAsset = async (assetId: string): Promise<AssetTaskStatus[]> => {
    const uid = getCurrentAppUserIdFromSession();
    if (uid == null) return [];
    return (await fetchAssetTaskStatusesForAssetFromBackend(uid, assetId)) ?? [];
};

export const getAllAssetTaskStatuses = async (): Promise<AssetTaskStatus[]> => [];

export const getTaskLogsForAsset = async (assetId: string): Promise<TaskLog[]> => {
    const uid = getCurrentAppUserIdFromSession();
    if (uid == null) return [];
    return (await fetchTaskLogsForAssetFromBackend(uid, assetId)) ?? [];
};

export const getAllTaskLogs = async (): Promise<TaskLog[]> => [];

/** Status hanya untuk daftar asset (lazy scope) — tidak memuat seluruh tabel. */
export const getAssetTaskStatusesForAssetIds = async (assetIds: string[]): Promise<AssetTaskStatus[]> => {
    const uid = getCurrentAppUserIdFromSession();
    if (uid == null || !assetIds.length) return [];
    return (await fetchAssetTaskStatusesForAssetIdsFromBackend(uid, assetIds)) ?? [];
};

export const getTaskLogsForAssetIds = async (assetIds: string[]): Promise<TaskLog[]> => {
    const uid = getCurrentAppUserIdFromSession();
    if (uid == null || !assetIds.length) return [];
    return (await fetchTaskLogsForAssetIdsFromBackend(uid, assetIds)) ?? [];
};

const isStatusDone = (s: AssetTaskStatus): boolean => {
    const v = s.status;
    if (typeof v === 'string') return v.toLowerCase() === 'done';
    return v === TaskCurrentStatus.Done;
};

/** Normalisasi taskId ke string agar cocok dengan data migrasi (DB bisa mengembalikan number). */
const norm = (id: string | number | undefined): string => (id == null ? '' : String(id));

/**
 * Menghitung persentase completion berdasarkan task yang sudah selesai (tercatat di log/status).
 * Completion = (jumlah task unik yang Done / total task di workflow) × 100.
 * Task unik = satu task hanya dihitung sekali meski ada banyak log/status (sesuai banyak task done di log).
 */
/**
 * Completion % = max(weighted taskScore progress, milestoneScore tertinggi yang sudah selesai).
 * Ini memastikan task milestone yang ditandai 90% langsung mendorong progress minimal 90%.
 * Jika bobot taskScore tidak tersedia, fallback ke count-based (Done steps / total workflow steps),
 * same rule as Capex list + capexbe progress-aggregate.calculateRates.
 */
export const calculateCompletionRate = async (
    assetId: string,
    workflow: WorkflowSet,
    statuses: AssetTaskStatus[],
    logs?: TaskLog[],
): Promise<number> => {
    if (!workflow || !workflow.steps?.length) return 0;

    const stepTaskIds = new Set(workflow.steps.map(s => norm(s.taskId)));

    const doneFromStatuses = new Set(
        statuses
            .filter(isStatusDone)
            .map(s => norm(s.taskId))
            .filter(tid => stepTaskIds.has(tid)),
    );
    const logRows = logs ?? [];
    const doneFromLogs = new Set(
        logRows.map((l: TaskLog) => norm(l.taskId)).filter((tid: string) => stepTaskIds.has(tid)),
    );
    const doneTaskIds = new Set<string>([...doneFromStatuses, ...doneFromLogs]);
    const stepWeightByTaskId = new Map<string, number>(
        workflow.steps.map(s => [norm(s.taskId), Number(s.taskScore ?? 0)] as [string, number]),
    );
    const milestoneByTaskId = new Map<string, number>(
        workflow.steps
            .filter(s => s.milestoneScore != null)
            .map(s => [norm(s.taskId), Number(s.milestoneScore ?? 0)] as [string, number]),
    );
    const totalWeight = Array.from(stepWeightByTaskId.values()).reduce((sum, w) => sum + Math.max(0, w), 0);
    const milestoneRate = Array.from(doneTaskIds).reduce(
        (max, tid) => Math.max(max, Math.max(0, milestoneByTaskId.get(tid) ?? 0)),
        0,
    );
    if (totalWeight > 0) {
        const doneWeight = Array.from(doneTaskIds).reduce(
            (sum, tid) => sum + Math.max(0, stepWeightByTaskId.get(tid) ?? 0),
            0,
        );
        const weightedRate = Math.min(100, Math.round((doneWeight / totalWeight) * 100));
        return Math.min(100, Math.max(weightedRate, milestoneRate));
    }

    const totalSteps = workflow.steps.length;
    if (totalSteps === 0) return 0;
    const countRate = Math.min(100, Math.round((doneTaskIds.size / totalSteps) * 100));
    return Math.min(100, Math.max(countRate, milestoneRate));
};

export const getMOMsForAsset = async (assetId: string): Promise<MOM[]> => {
    const uid = getCurrentAppUserIdFromSession();
    if (uid == null) return [];
    return (await fetchMomsForAssetFromBackend(uid, assetId)) ?? [];
};

export const addMOM = async (assetId: string, content: string, user: User): Promise<MOM> => {
    const now = new Date();
    const newMOM: MOM = {
        id: `mom-${assetId}-${now.getTime()}`,
        assetId,
        content,
        createdAt: now.toISOString(),
        createdByUserId: user.id,
        createdByUsername: user.username,
    };
    const saved = await saveMomViaBackend(user.id, newMOM);
    return saved ?? newMOM;
};

export const updateMOMContent = async (mom: MOM, content: string, user?: User): Promise<MOM> => {
    const trimmed = content.trim();
    const updated: MOM = { ...mom, content: trimmed };
    const uid = user?.id ?? getCurrentAppUserIdFromSession();
    if (uid != null) {
        const saved = await saveMomViaBackend(uid, updated);
        if (saved) return saved;
    }
    return updated;
};

type AssetMomContext = {
    assetId: string;
    assetCode: string;
    assetName: string;
    projectCode: string;
    projectName: string;
    archetypeName: string;
    archetypeId: string;
    huName: string;
    huId: string;
};

function buildAssetMomContextMapFromBudgetPeriod(period: BudgetPeriod | null | undefined): Map<string, AssetMomContext> {
    const map = new Map<string, AssetMomContext>();
    if (!period?.archetypes?.length) return map;
    for (const arch of period.archetypes) {
        for (const unit of arch.units) {
            for (const proj of unit.projects) {
                for (const asset of proj.assets) {
                    map.set(asset.id, {
                        assetId: asset.id,
                        assetCode: asset.assetCode ?? '',
                        assetName: asset.assetName ?? '',
                        projectCode: proj.projectCode ?? '',
                        projectName: proj.projectName ?? '',
                        archetypeName: arch.name ?? '',
                        archetypeId: arch.id ?? '',
                        huName: unit.name ?? '',
                        huId: unit.id ?? '',
                    });
                }
            }
        }
    }
    return map;
}

function filterAssetMomContextMapByScope(
    map: Map<string, AssetMomContext>,
    userScopes: UserScopesForCapex,
): Map<string, AssetMomContext> {
    if (userScopes.all) return new Map(map);
    const out = new Map<string, AssetMomContext>();
    for (const [id, ctx] of map) {
        const inArch =
            userScopes.archetypes.has(ctx.archetypeName) || userScopes.archetypeIds.has(ctx.archetypeId);
        const inHu = userScopes.hus.has(ctx.huName) || userScopes.huIds.has(ctx.huId);
        if (inArch || inHu) out.set(id, ctx);
    }
    return out;
}

/** Batas awal/akhir hari lokal untuk tanggal `YYYY-MM-DD`. */
export function localDayBoundsIso(yyyyMmDd: string): { startIso: string; endIso: string } {
    const parts = yyyyMmDd.split('-').map((p) => parseInt(p, 10));
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (!y || !m || !d) {
        const now = new Date();
        const ds = now.toLocaleDateString('en-CA');
        return localDayBoundsIso(ds);
    }
    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(y, m - 1, d, 23, 59, 59, 999);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/**
 * MOM yang dibuat pada hari yang dipilih, untuk asset dalam periode anggaran aktif,
 * difilter sesuai scope user (sama logika dengan Capex Project List).
 */
export async function getDailyMOMSummaryRows(
    periodName: string,
    summaryDateYyyyMmDd: string,
    userScopes: UserScopesForCapex,
    userId?: number,
): Promise<DailyMOMSummaryRow[]> {
    if (userId) {
        const { fetchMomDailySummaryFromBackend } = await import('./momDailySummaryApi');
        const beRows = await fetchMomDailySummaryFromBackend(
            userId,
            periodName,
            summaryDateYyyyMmDd,
            userScopes,
        );
        if (beRows) return beRows;
    }

    return [];
}

export const addAdhocTask = async (
    assetId: string,
    description: string,
    assignedToUserId: number,
    dueDate: string,
    creator: User
): Promise<AdhocTask> => {
    const allUsers = await configService.getAllUsers();
    const assignedToUser = allUsers.find(u => u.id === assignedToUserId);
    if (!assignedToUser) throw new Error('Assigned user not found');
    const now = new Date();
    const newTask: AdhocTask = {
        id: `adhoc-${assetId}-${now.getTime()}`,
        assetId,
        description,
        assignedToUserId,
        assignedToUsername: assignedToUser.username,
        dueDate,
        status: AdhocTaskStatus.Open,
        createdAt: now.toISOString(),
        createdByUserId: creator.id,
        createdByUsername: creator.username,
    };
    const saved = await saveAdhocTaskViaBackend(creator.id, newTask);
    return saved ?? newTask;
};

export const markAdhocTaskAsDone = async (taskId: string, remark: string, user?: User): Promise<AdhocTask> => {
    if (!user) throw new Error('User required for adhoc task completion.');
    const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
    const result = await completeAdhocTaskViaBe({ userId: user.id, accessToken, adhocTaskId: taskId, remark });
    if (!result.success) throw new Error(result.message);
    return {
        id: taskId,
        assetId: '',
        description: '',
        assignedToUserId: user.id,
        assignedToUsername: user.username,
        dueDate: '',
        status: AdhocTaskStatus.Done,
        createdAt: new Date().toISOString(),
        createdByUserId: user.id,
        createdByUsername: user.username,
        completedAt: new Date().toISOString(),
        completionRemark: remark,
    };
};


function mergeSupplementalAfterLastDoneWorkflow(
    sortedWorkflow: WorkflowTaskDetail[],
    isRowDone: (w: WorkflowTaskDetail) => boolean,
    momItems: MOMDetail[],
    adhocItems: AdhocTaskDetail[],
    auditItems: AuditLogDetail[],
): TimelineItem[] {
    const supplemental = [...momItems, ...adhocItems, ...auditItems].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    let lastDoneIdx = -1;
    for (let i = 0; i < sortedWorkflow.length; i++) {
        if (isRowDone(sortedWorkflow[i])) {
            lastDoneIdx = i;
        }
    }
    if (lastDoneIdx < 0) {
        return [...sortedWorkflow, ...supplemental];
    }
    return [
        ...sortedWorkflow.slice(0, lastDoneIdx + 1),
        ...supplemental,
        ...sortedWorkflow.slice(lastDoneIdx + 1),
    ];
}

export const getTimelineForAsset = async (assetId: string, workflowSetId?: string, projectId?: string): Promise<TimelineItem[]> => {
    if (typeof window === 'undefined' || !workflowSetId) return [];
    const uid = getCurrentAppUserIdFromSession();
    if (uid == null) return [];
    try {
        const token = await resolveMyTasksAccessToken(getAccessTokenForBackend);
        const result = await fetchAssetTimelineFromBe(
            { assetId, workflowSetId, projectId: projectId || undefined },
            token,
            uid,
        );
        return result?.items ?? [];
    } catch (e) {
        _warn('BE asset-timeline failed', e);
        return [];
    }
};

/** Prefetch timeline + roles so detail panel can render without waiting on first open. */
export const prefetchAssetTimeline = (
  assetId: string,
  workflowSetId: string,
  projectId?: string,
): Promise<void> => {
  const wf = String(workflowSetId ?? '').trim();
  if (!wf) return Promise.resolve();
  const key = assetTimelineCacheKey(assetId, wf);
  if (getCachedAssetTimeline(key)) return Promise.resolve();
  const existing = getAssetTimelineInflight(key);
  if (existing) return existing.then(() => undefined);

  const promise = Promise.all([
    configService.getAllRoles(),
    getTimelineForAsset(assetId, wf, projectId),
  ])
    .then(([roles, items]) => {
      const entry = { items, roles, fetchedAt: Date.now() };
      setCachedAssetTimeline(key, entry);
      return entry;
    })
    .catch(() => null);

  setAssetTimelineInflight(key, promise);
  return promise.then(() => undefined);
};

export const calculatePlanDates = (workflow: WorkflowSet, assetEndTargetDate?: string): Map<string, string> => {
    const planDates = new Map<string, string>();
    if (!assetEndTargetDate || !workflow) return planDates;

    const sortedSteps = [...workflow.steps].sort((a, b) => b.order - a.order);
    let currentDate = new Date(assetEndTargetDate);

    for (const step of sortedSteps) {
        planDates.set(step.taskId, currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() - step.slaToComplete);
    }

    return planDates;
};

export const calculateProjectionDates = (workflow: WorkflowSet, statuses: AssetTaskStatus[]): Map<string, string> => {
    const projectionDates = new Map<string, string>();
    if (!workflow) return projectionDates;

    const statusMap = new Map(statuses.map(s => [norm(s.taskId), s]));
    const sortedSteps = [...workflow.steps].sort((a, b) => a.order - b.order);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isOpenStatus = (s: AssetTaskStatus | undefined): boolean => {
        if (!s) return false;
        const v = s.status;
        if (typeof v === 'string') return v.toLowerCase() === 'open';
        return v === TaskCurrentStatus.Open;
    };

    for (const [index, step] of sortedSteps.entries()) {
        const stepTaskId = norm(step.taskId);
        const status = statusMap.get(stepTaskId);

        // Priority 1: Actual Date (Task is Done)
        if (status && isStatusDone(status) && status.completedAt) {
            projectionDates.set(stepTaskId, new Date(status.completedAt).toISOString().split('T')[0]);
            continue;
        }

        // Priority 2: Rescheduled Date
        if (status?.rescheduledEndDate) {
            projectionDates.set(stepTaskId, status.rescheduledEndDate);
            continue;
        }

        let latestTriggerCompletionDate = new Date(0);
        const triggerIds = (step.triggeringTaskIds?.length > 0)
            ? step.triggeringTaskIds
            : (index > 0 ? [sortedSteps[index - 1].taskId] : []);

        triggerIds.forEach(triggerId => {
            const triggerDateStr = projectionDates.get(norm(triggerId));
            if (triggerDateStr) {
                const triggerDate = new Date(triggerDateStr);
                if (triggerDate > latestTriggerCompletionDate) {
                    latestTriggerCompletionDate = triggerDate;
                }
            }
        });

        let calculationStartDate: Date;

        // An open task's clock starts ticking from the latest of its trigger completion, or today if delayed.
        if (isOpenStatus(status)) {
            calculationStartDate = new Date(Math.max(latestTriggerCompletionDate.getTime(), today.getTime()));
        } else { // A locked task will start after its triggers. First task starts today if no triggers.
            calculationStartDate = latestTriggerCompletionDate.getTime() > 0 ? latestTriggerCompletionDate : today;
        }

        const projectedEndDate = new Date(calculationStartDate);
        projectedEndDate.setDate(projectedEndDate.getDate() + getEffectiveSlaDays(step, status));
        projectionDates.set(stepTaskId, projectedEndDate.toISOString().split('T')[0]);
    }

    return projectionDates;
};
