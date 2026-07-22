import { BadRequestException, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthZService } from '../auth/auth-z.service';
import { assertAnyHierarchyPermission } from '../shared/authz-helpers.util';
import { isSuperAdminRole } from '../auth/auth.constants';
import { ProjectListService } from '../project-list/project-list.service';
import { getAllRoles, getAllUsers, getAllWorkflowSets, getAllTasks } from '../project-list/master-data.loader';
import {
  fetchRecordsByAssetIds,
  toCamelCase,
  normAssetTaskStatusRow,
  normTaskLogRow,
} from '../project-list/supabase-helpers';
import { recalculateAssetTaskStatuses } from '../smart-migration/recalculate-asset-task-statuses';
import { isWorkflowBypassRole } from '../shared/workflow-role-policy';

const norm = (id: string | number | undefined) => (id == null ? '' : String(id));
const FINAL_FS_CONCLUSIONS = new Set(['Approved', 'Approved with Notes', 'Rejected']);

const SYSTEM_REMARKS: Record<string, string> = {
  BUDGET_APPROVED: 'Budget for the parent project was approved.',
  PO_CREATED: 'Purchase Order value was recorded for this asset.',
  ASSET_CREATED: 'Asset record was created.',
  ASSET_BUDGET_PLAN_FILLED: 'Budget Plan for this asset was filled.',
  PO_GOODS_RECEIVED: 'Goods for the Purchase Order have been received.',
  FS_REQUEST: 'Feasibility Study was requested for this asset.',
  FS_APPROVAL: 'Feasibility Study approval process was completed.',
};

function taskHasTriggerEvent(task: any, event: string): boolean {
  if (!task?.isSystemTriggered && !task?.is_system_triggered) return false;
  const fromArray = Array.isArray(task.triggerEvents)
    ? task.triggerEvents
    : Array.isArray(task.trigger_events)
      ? task.trigger_events
      : [];
  if (fromArray.map(String).includes(event)) return true;
  const legacy = String(task.triggerEvent ?? task.trigger_event ?? '')
    .split(/[|,]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return legacy.includes(event);
}

function camelToSnakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

function camelToSnakeObject(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(input).forEach(([k, v]) => {
    out[camelToSnakeKey(k)] = v;
  });
  return out;
}

@Injectable()
export class TaskActionsService {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly authZ: AuthZService,
    private readonly projectListService: ProjectListService,
  ) {}

  private async assertTaskMutation(accessToken: string, userId: number): Promise<void> {
    await assertAnyHierarchyPermission(this.authZ, accessToken, userId, [
      { hierarchy: 'My Task', level: 'update' },
      { hierarchy: 'Capex Project List', level: 'update' },
    ]);
  }

  private async assertTaskRead(accessToken: string, userId: number): Promise<void> {
    await assertAnyHierarchyPermission(this.authZ, accessToken, userId, [
      { hierarchy: 'My Task', level: 'view' },
      { hierarchy: 'Capex Project List', level: 'view' },
    ]);
  }

  private async authedClient(accessToken: string, userId: number): Promise<SupabaseClient> {
    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    return client;
  }

  private isSuperAdminUser(user: { assignments?: { roleName?: string }[] }): boolean {
    return (user.assignments || []).some((a) => isSuperAdminRole(a.roleName));
  }

  private async loadUser(client: SupabaseClient, userId: number) {
    const allUsers = await getAllUsers(client);
    const user = allUsers.find((u: any) => Number(u.id) === Number(userId));
    if (!user) throw new BadRequestException('User not found');
    return user;
  }

  private async loadDoneStatus(
    client: SupabaseClient,
    assetId: string,
    taskId: string,
  ): Promise<{ status: Record<string, any>; log: Record<string, any> | null }> {
    const taskStatusId = `${assetId}-${taskId}`;
    const { data: statusRow, error: stErr } = await client
      .from('asset_task_statuses')
      .select('*')
      .eq('id', taskStatusId)
      .maybeSingle();
    if (stErr) throw new BadRequestException(stErr.message);
    if (!statusRow) throw new BadRequestException("Task status not found.");

    const status = toCamelCase(statusRow) as Record<string, any>;
    const statusVal = String(status.status ?? '').toLowerCase();
    if (statusVal !== 'done') {
      throw new BadRequestException("Task is not in 'Done' state.");
    }

    let log: Record<string, any> | null = null;
    if (status.logId) {
      const { data: logRow, error: logErr } = await client
        .from('task_logs')
        .select('*')
        .eq('id', String(status.logId))
        .maybeSingle();
      if (logErr) throw new BadRequestException(logErr.message);
      if (logRow) log = toCamelCase(logRow) as Record<string, any>;
    }

    return { status, log };
  }

  /**
   * Mirrors capexapp taskService.markTaskAsDone — single server round-trip + deterministic recalculation.
   */
  async completeWorkflow(
    accessToken: string,
    body: { userId: number; assetId: string; taskId: string; remark: string; roleId: number },
  ) {
    await this.assertTaskMutation(accessToken, body.userId);
    const remark = body.remark?.trim();
    if (!remark) {
      throw new BadRequestException('Remark is required');
    }

    const client = await this.authedClient(accessToken, body.userId);
    const [allUsers, allRoles, workflows] = await Promise.all([
      getAllUsers(client),
      getAllRoles(client),
      getAllWorkflowSets(client),
    ]);

    const user = allUsers.find((u: any) => Number(u.id) === Number(body.userId));
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const assetId = norm(body.assetId);
    const taskId = norm(body.taskId);
    const taskStatusId = `${assetId}-${taskId}`;

    const { data: assetRow, error: assetErr } = await client.from('assets').select('*').eq('id', assetId).maybeSingle();
    if (assetErr || !assetRow) {
      throw new BadRequestException('Asset not found');
    }
    const asset = toCamelCase(assetRow) as Record<string, any>;
    const workflowSetId = norm(asset.workflowSetId);
    const workflow = workflows.find((w: any) => norm(w.id) === workflowSetId);
    const step = workflow?.steps?.find((s: any) => norm(s.taskId) === taskId);

    const bypassRole = isWorkflowBypassRole(user);
    const assignmentRoleNames = new Set((user.assignments || []).map((a: any) => a.roleName).filter(Boolean));
    const userRoleIds = new Set(
      allRoles.filter((r: any) => assignmentRoleNames.has(r.roleName)).map((r: any) => Number(r.id)),
    );
    const roleIdNum = Number(body.roleId);
    const assignedRole = allRoles.find((r: any) => Number(r.id) === roleIdNum);
    if (!assignedRole) {
      throw new BadRequestException('Role not found');
    }

    const roleInUserAssignments = userRoleIds.has(roleIdNum);
    const roleInStep =
      workflow && step
        ? (step.roleIds || []).some((rid: any) => Number(rid) === roleIdNum)
        : false;

    if (!roleInUserAssignments && !(bypassRole && roleInStep)) {
      throw new BadRequestException('Selected role is not assigned to your user account');
    }

    if (workflow && step && !bypassRole && !roleInStep) {
      throw new BadRequestException('This role cannot complete this workflow step');
    }

    const { data: statusRow, error: stErr } = await client
      .from('asset_task_statuses')
      .select('*')
      .eq('id', taskStatusId)
      .maybeSingle();
    if (stErr) throw new BadRequestException(stErr.message);

    const baseStatus = statusRow ? (toCamelCase(statusRow) as Record<string, any>) : null;
    const currentStatusVal = baseStatus?.status;
    const isDone =
      typeof currentStatusVal === 'string'
        ? String(currentStatusVal).toLowerCase() === 'done'
        : currentStatusVal === 'Done';
    if (isDone) {
      throw new BadRequestException('Task is already completed');
    }

    /** Match capexapp markTaskAsDone: authorized users may complete anytime while not Done. */

    const now = new Date();
    const logId = `log-${assetId}-${taskId}-${now.getTime()}`;
    const newLog = {
      id: logId,
      asset_id: assetId,
      task_id: taskId,
      remark,
      completed_at: now.toISOString(),
      completed_by_user_id: user.id,
      completed_by_username: user.username,
      completed_by_user_role: assignedRole.roleName,
      completed_by_type: 'User',
    };

    const { error: logErr } = await client.from('task_logs').insert(newLog);
    if (logErr) throw new BadRequestException(`task_logs: ${logErr.message}`);

    const upsertRow = {
      id: taskStatusId,
      asset_id: assetId,
      task_id: taskId,
      status: 'Done',
      completed_at: now.toISOString(),
      log_id: logId,
      start_date: baseStatus?.startDate || now.toISOString(),
      target_end_date: baseStatus?.targetEndDate || now.toISOString(),
    };

    const { error: upErr } = await client.from('asset_task_statuses').upsert(upsertRow, { onConflict: 'id' });
    if (upErr) throw new BadRequestException(`asset_task_statuses: ${upErr.message}`);

    await recalculateAssetTaskStatuses(client, assetId, workflows);

    void this.projectListService.invalidateCachesForAssetMutation(accessToken, body.userId, assetId);

    return { success: true, message: 'Task marked as complete.' };
  }

  async completeAdhoc(accessToken: string, body: { userId: number; adhocTaskId: string; remark: string }) {
    await this.assertTaskMutation(accessToken, body.userId);
    const remark = body.remark?.trim();
    if (!remark) {
      throw new BadRequestException('Remark is required');
    }

    const client = await this.authedClient(accessToken, body.userId);

    const { data: row, error } = await client.from('adhoc_tasks').select('*').eq('id', body.adhocTaskId).maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!row) throw new BadRequestException('Ad-hoc task not found');

    const adhoc = toCamelCase(row) as Record<string, any>;
    if (Number(adhoc.assignedToUserId) !== Number(body.userId)) {
      throw new BadRequestException('You are not assigned to this ad-hoc task');
    }
    if (String(adhoc.status).toLowerCase() === 'done') {
      throw new BadRequestException('Task is already completed');
    }

    const now = new Date().toISOString();
    const { error: upErr } = await client
      .from('adhoc_tasks')
      .update({
        status: 'Done',
        completed_at: now,
        completion_remark: remark,
      })
      .eq('id', body.adhocTaskId);

    if (upErr) throw new BadRequestException(upErr.message);

    return { success: true, message: 'Ad-hoc task marked as complete.' };
  }

  async revertToOpen(
    accessToken: string,
    body: { userId: number; assetId: string; taskId: string },
  ) {
    await this.assertTaskMutation(accessToken, body.userId);
    const client = await this.authedClient(accessToken, body.userId);
    const user = await this.loadUser(client, body.userId);
    const assetId = norm(body.assetId);
    const taskId = norm(body.taskId);
    const { status, log } = await this.loadDoneStatus(client, assetId, taskId);

    if (!log) {
      throw new BadRequestException('Task log not found.');
    }
    if (String(log.completedByType || '').toLowerCase() === 'system') {
      throw new BadRequestException('System-completed tasks cannot be reverted from this action.');
    }
    const completedBy = Number(log.completedByUserId);
    if (!this.isSuperAdminUser(user) && completedBy !== Number(user.id)) {
      throw new BadRequestException('Only the user who completed the task can revert it.');
    }

    const { error: upErr } = await client
      .from('asset_task_statuses')
      .update({
        status: 'Open',
        completed_at: null,
        log_id: null,
        reported_not_yet_by_user_id: null,
        reported_not_yet_by_username: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', String(status.id));
    if (upErr) throw new BadRequestException(upErr.message);

    // Remove completion logs so timeline/recalculate no longer treat this task as Done.
    const { error: delLogErr } = await client
      .from('task_logs')
      .delete()
      .eq('asset_id', assetId)
      .eq('task_id', taskId);
    if (delLogErr) throw new BadRequestException(delLogErr.message);

    const workflows = await getAllWorkflowSets(client);
    await recalculateAssetTaskStatuses(client, assetId, workflows);
    void this.projectListService.invalidateCachesForAssetMutation(accessToken, body.userId, assetId);

    return { success: true, message: "Task reverted to 'Open'." };
  }

  async reportNotYetDone(
    accessToken: string,
    body: { userId: number; assetId: string; taskId: string },
  ) {
    await this.assertTaskMutation(accessToken, body.userId);
    const client = await this.authedClient(accessToken, body.userId);
    const user = await this.loadUser(client, body.userId);
    const assetId = norm(body.assetId);
    const taskId = norm(body.taskId);
    const { status, log } = await this.loadDoneStatus(client, assetId, taskId);

    if (log && Number(log.completedByUserId) === Number(user.id)) {
      throw new BadRequestException('You cannot report a task you completed yourself.');
    }
    if (status.reportedNotYetByUserId) {
      throw new BadRequestException(
        `Task already reported by ${status.reportedNotYetByUsername || 'another user'}.`,
      );
    }

    const { error: upErr } = await client
      .from('asset_task_statuses')
      .update({
        reported_not_yet_by_user_id: Number(user.id),
        reported_not_yet_by_username: user.username,
        updated_at: new Date().toISOString(),
      })
      .eq('id', String(status.id));
    if (upErr) throw new BadRequestException(upErr.message);

    void this.projectListService.invalidateCachesForAssetMutation(accessToken, body.userId, assetId);
    return { success: true, message: 'Task has been reported.' };
  }

  async withdrawReport(
    accessToken: string,
    body: { userId: number; assetId: string; taskId: string },
  ) {
    await this.assertTaskMutation(accessToken, body.userId);
    const client = await this.authedClient(accessToken, body.userId);
    const user = await this.loadUser(client, body.userId);
    const assetId = norm(body.assetId);
    const taskId = norm(body.taskId);
    const taskStatusId = `${assetId}-${taskId}`;

    const { data: statusRow, error: stErr } = await client
      .from('asset_task_statuses')
      .select('*')
      .eq('id', taskStatusId)
      .maybeSingle();
    if (stErr) throw new BadRequestException(stErr.message);
    if (!statusRow) throw new BadRequestException('Task status not found.');

    const status = toCamelCase(statusRow) as Record<string, any>;
    if (!status.reportedNotYetByUserId) {
      throw new BadRequestException('Task has no active report.');
    }
    if (Number(status.reportedNotYetByUserId) !== Number(user.id) && !this.isSuperAdminUser(user)) {
      throw new BadRequestException('Only the user who reported the task can withdraw it.');
    }

    const { error: upErr } = await client
      .from('asset_task_statuses')
      .update({
        reported_not_yet_by_user_id: null,
        reported_not_yet_by_username: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskStatusId);
    if (upErr) throw new BadRequestException(upErr.message);

    void this.projectListService.invalidateCachesForAssetMutation(accessToken, body.userId, assetId);
    return { success: true, message: 'Report has been withdrawn.' };
  }

  async updateRemark(
    accessToken: string,
    body: { userId: number; assetId: string; taskId: string; remark: string },
  ) {
    await this.assertTaskMutation(accessToken, body.userId);
    const remark = body.remark?.trim();
    if (!remark) throw new BadRequestException('Remark is required');

    const client = await this.authedClient(accessToken, body.userId);
    const user = await this.loadUser(client, body.userId);
    const assetId = norm(body.assetId);
    const taskId = norm(body.taskId);
    const { status: _status, log } = await this.loadDoneStatus(client, assetId, taskId);

    if (!log) throw new BadRequestException('Task log not found.');
    if (String(log.completedByType || '').toLowerCase() === 'system') {
      throw new BadRequestException('System completion remarks cannot be edited.');
    }
    const completedBy = Number(log.completedByUserId);
    if (!this.isSuperAdminUser(user) && completedBy !== Number(user.id)) {
      throw new BadRequestException('Only the user who completed the task can edit the remark.');
    }

    const previousRemark = String(log.remark ?? '');
    if (previousRemark.trim() === remark) {
      return {
        success: true,
        message: 'Remark unchanged.',
        remark,
        remarkEditHistory: Array.isArray(log.remarkEditHistory) ? log.remarkEditHistory : [],
      };
    }

    const existingHistory = Array.isArray(log.remarkEditHistory) ? log.remarkEditHistory : [];
    const nextHistory = [
      ...existingHistory,
      {
        editedAt: new Date().toISOString(),
        editedByUserId: Number(user.id),
        editedByUsername: String(user.username ?? ''),
        previousRemark,
        newRemark: remark,
      },
    ];

    const { error: upErr } = await client
      .from('task_logs')
      .update({
        remark,
        remark_edit_history: nextHistory,
      })
      .eq('id', String(log.id));
    if (upErr) {
      // Column may not exist yet — fall back to remark-only update and surface guidance.
      if (/remark_edit_history/i.test(upErr.message)) {
        const { error: fallbackErr } = await client
          .from('task_logs')
          .update({ remark })
          .eq('id', String(log.id));
        if (fallbackErr) throw new BadRequestException(fallbackErr.message);
        void this.projectListService.invalidateCachesForAssetMutation(accessToken, body.userId, assetId);
        return {
          success: true,
          message:
            'Remark updated (jalankan migrasi remark_edit_history agar riwayat edit tersimpan).',
          remark,
          remarkEditHistory: [],
        };
      }
      throw new BadRequestException(upErr.message);
    }

    void this.projectListService.invalidateCachesForAssetMutation(accessToken, body.userId, assetId);
    return {
      success: true,
      message: 'Remark updated.',
      remark,
      remarkEditHistory: nextHistory,
    };
  }

  /**
   * Upsert FS conclusion for a project when completing an FS_APPROVAL trigger task.
   * Creates a minimal FS row when none exists yet.
   */
  async upsertFsApproval(
    accessToken: string,
    body: {
      userId: number;
      projectId: string;
      conclusion: string;
      amount?: number;
      followUpAction?: string | null;
      fsType?: string;
    },
  ) {
    await this.authZ.assertHierarchyPermission(accessToken, body.userId, 'FS Approval', 'update');
    const conclusion = String(body.conclusion ?? '').trim();
    if (!FINAL_FS_CONCLUSIONS.has(conclusion)) {
      throw new BadRequestException(
        'Conclusion must be Approved, Approved with Notes, or Rejected.',
      );
    }
    const projectId = norm(body.projectId);
    if (!projectId) throw new BadRequestException('projectId is required');

    const client = await this.authedClient(accessToken, body.userId);
    await this.loadUser(client, body.userId);

    const { data: existingRows, error: findErr } = await client
      .from('feasibility_studies')
      .select('*')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (findErr) throw new BadRequestException(findErr.message);

    const existing = Array.isArray(existingRows) && existingRows.length > 0 ? existingRows[0] : null;
    const now = new Date().toISOString();
    const followUp =
      body.followUpAction === undefined
        ? undefined
        : body.followUpAction == null
          ? null
          : String(body.followUpAction);

    if (existing) {
      const row: Record<string, unknown> = {
        conclusion,
        updated_at: now,
      };
      if (body.amount !== undefined) row.amount = Number(body.amount) || 0;
      if (followUp !== undefined) row.follow_up_action = followUp;
      if (body.fsType !== undefined) row.fs_type = String(body.fsType).trim() || existing.fs_type;

      const { data, error } = await client
        .from('feasibility_studies')
        .update(row)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new BadRequestException(error.message);
      return { success: true, study: toCamelCase(data), fsStatus: conclusion };
    }

    const id = `FS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const insertRow = {
      id,
      project_id: projectId,
      fs_type: String(body.fsType ?? 'Capex').trim() || 'Capex',
      amount: Number(body.amount ?? 0) || 0,
      irr: 0,
      payback_period: 0,
      npv: 0,
      roi: 0,
      planned_revenue_start_date: now.slice(0, 10),
      actual_revenue_start_date: null,
      monthly_revenue_plan: 0,
      throughput: 0,
      conclusion,
      follow_up_action: followUp ?? null,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await client
      .from('feasibility_studies')
      .insert(insertRow)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    return { success: true, study: toCamelCase(data), fsStatus: conclusion };
  }

  async recalculateAsset(accessToken: string, body: { userId: number; assetId: string }) {
    await this.assertTaskMutation(accessToken, body.userId);
    const assetId = norm(body.assetId);
    if (!assetId) throw new BadRequestException('assetId is required');
    const client = await this.authedClient(accessToken, body.userId);
    const workflows = await getAllWorkflowSets(client);
    await recalculateAssetTaskStatuses(client, assetId, workflows);
    void this.projectListService.invalidateCachesForAssetMutation(accessToken, body.userId, assetId);
    return { ok: true };
  }

  async saveMom(
    accessToken: string,
    body: { userId: number; mom: Record<string, unknown> },
  ) {
    await this.assertTaskMutation(accessToken, body.userId);
    const mom = body.mom;
    if (!mom || typeof mom !== 'object') throw new BadRequestException('mom is required');
    const client = await this.authedClient(accessToken, body.userId);
    const row = camelToSnakeObject(mom as Record<string, unknown>);
    const { data, error } = await client.from('moms').upsert(row).select().single();
    if (error) throw new BadRequestException(error.message);
    return { mom: toCamelCase(data) };
  }

  async saveAdhocTask(
    accessToken: string,
    body: { userId: number; task: Record<string, unknown> },
  ) {
    await this.assertTaskMutation(accessToken, body.userId);
    const task = body.task;
    if (!task || typeof task !== 'object') throw new BadRequestException('task is required');
    const client = await this.authedClient(accessToken, body.userId);
    const row = camelToSnakeObject(task as Record<string, unknown>);
    const { data, error } = await client.from('adhoc_tasks').upsert(row).select().single();
    if (error) throw new BadRequestException(error.message);
    return { task: toCamelCase(data) };
  }

  async rescheduleTask(
    accessToken: string,
    body: { userId: number; assetId: string; taskId: string; days: number; reason: string },
  ) {
    await this.assertTaskMutation(accessToken, body.userId);
    const client = await this.authedClient(accessToken, body.userId);
    const assetId = norm(body.assetId);
    const taskId = norm(body.taskId);
    const taskStatusId = `${assetId}-${taskId}`;
    const { data: statusRow, error: stErr } = await client
      .from('asset_task_statuses')
      .select('*')
      .eq('id', taskStatusId)
      .maybeSingle();
    if (stErr) throw new BadRequestException(stErr.message);
    if (!statusRow) throw new BadRequestException('Task status not found.');
    const status = toCamelCase(statusRow) as Record<string, any>;
    if (String(status.status).toLowerCase() === 'done') {
      throw new BadRequestException('Completed tasks cannot be rescheduled.');
    }
    const newEndDate = new Date();
    newEndDate.setDate(newEndDate.getDate() + Number(body.days));
    const { error: upErr } = await client
      .from('asset_task_statuses')
      .update({
        rescheduled_end_date: newEndDate.toISOString().slice(0, 10),
        reschedule_reason: String(body.reason ?? '').trim(),
      })
      .eq('id', taskStatusId);
    if (upErr) throw new BadRequestException(upErr.message);
    const workflows = await getAllWorkflowSets(client);
    await recalculateAssetTaskStatuses(client, assetId, workflows);
    void this.projectListService.invalidateCachesForAssetMutation(accessToken, body.userId, assetId);
    return { success: true, message: 'Task rescheduled successfully.' };
  }

  async updateSlaOverride(
    accessToken: string,
    body: { userId: number; assetId: string; taskId: string; slaDays: number | null },
  ) {
    await this.assertTaskMutation(accessToken, body.userId);
    const client = await this.authedClient(accessToken, body.userId);
    const assetId = norm(body.assetId);
    const taskId = norm(body.taskId);
    const taskStatusId = `${assetId}-${taskId}`;
    const { data: statusRow, error: stErr } = await client
      .from('asset_task_statuses')
      .select('*')
      .eq('id', taskStatusId)
      .maybeSingle();
    if (stErr) throw new BadRequestException(stErr.message);
    if (!statusRow) throw new BadRequestException('Task status not found for this asset.');
    const status = toCamelCase(statusRow) as Record<string, any>;
    if (String(status.status).toLowerCase() === 'done') {
      throw new BadRequestException('Cannot change SLA for a completed task.');
    }
    const slaDays = body.slaDays == null ? null : Number(body.slaDays);
    const updateRow: Record<string, unknown> = {
      sla_to_complete_override: slaDays,
    };
    if (String(status.status).toLowerCase() === 'open' && status.startDate) {
      const { data: assetRow } = await client.from('assets').select('*').eq('id', assetId).maybeSingle();
      if (assetRow) {
        const asset = toCamelCase(assetRow) as Record<string, any>;
        const workflows = await getAllWorkflowSets(client);
        const workflow = workflows.find((w: any) => norm(w.id) === norm(asset.workflowSetId));
        const step = workflow?.steps?.find((s: any) => norm(s.taskId) === taskId);
        if (step) {
          const effectiveSla =
            slaDays != null && Number.isFinite(slaDays)
              ? slaDays
              : Number(step.slaToComplete ?? step.sla_to_complete ?? 0);
          const start = new Date(String(status.startDate));
          const target = new Date(start);
          target.setDate(start.getDate() + effectiveSla);
          updateRow.target_end_date = target.toISOString().slice(0, 10);
        }
      }
    }
    const { error: upErr } = await client.from('asset_task_statuses').update(updateRow).eq('id', taskStatusId);
    if (upErr) throw new BadRequestException(upErr.message);
    const workflows = await getAllWorkflowSets(client);
    await recalculateAssetTaskStatuses(client, assetId, workflows);
    void this.projectListService.invalidateCachesForAssetMutation(accessToken, body.userId, assetId);
    const message =
      slaDays == null ? 'SLA override cleared; using workflow default.' : `SLA override set to ${slaDays} day(s).`;
    return { success: true, message };
  }

  async triggerSystemTask(
    accessToken: string,
    body: { userId: number; assetId: string; triggerEvent: string; completedAt?: string },
  ) {
    await this.assertTaskMutation(accessToken, body.userId);
    const client = await this.authedClient(accessToken, body.userId);
    const user = await this.loadUser(client, body.userId);
    const assetId = norm(body.assetId);
    const triggerEvent = String(body.triggerEvent ?? '').trim();
    if (!triggerEvent) throw new BadRequestException('triggerEvent is required');

    const [workflows, tasks] = await Promise.all([getAllWorkflowSets(client), getAllTasks(client)]);
    const { data: assetRow, error: assetErr } = await client.from('assets').select('*').eq('id', assetId).maybeSingle();
    if (assetErr || !assetRow) return { ok: true };
    const asset = toCamelCase(assetRow) as Record<string, any>;
    const workflowSetId = norm(asset.workflowSetId);
    if (!workflowSetId) return { ok: true };
    const workflow = workflows.find((w: any) => norm(w.id) === workflowSetId);
    if (!workflow) return { ok: true };

    const systemTasks = (tasks as any[]).filter((t) => taskHasTriggerEvent(t, triggerEvent));
    if (!systemTasks.length) return { ok: true };

    const completedAtIso =
      body.completedAt && !Number.isNaN(new Date(body.completedAt).getTime())
        ? new Date(body.completedAt).toISOString()
        : new Date().toISOString();

    for (const systemTask of systemTasks) {
      const step = (workflow as any).steps?.find((s: any) => norm(s.taskId) === norm(systemTask.id));
      if (!step) continue;
      const taskStatusId = `${assetId}-${norm(systemTask.id)}`;
      const { data: statusRow } = await client
        .from('asset_task_statuses')
        .select('*')
        .eq('id', taskStatusId)
        .maybeSingle();
      if (statusRow && String(statusRow.status).toLowerCase() === 'done') continue;

      const logId = `log-sys-${assetId}-${norm(systemTask.id)}-${Date.now()}`;
      const { error: logErr } = await client.from('task_logs').insert({
        id: logId,
        asset_id: assetId,
        task_id: norm(systemTask.id),
        remark: SYSTEM_REMARKS[triggerEvent] || 'System event triggered.',
        completed_at: completedAtIso,
        completed_by_type: 'System',
        completed_by_user_id: user.id,
        completed_by_username: user.username,
      });
      if (logErr) throw new BadRequestException(logErr.message);

      const { error: upErr } = await client.from('asset_task_statuses').upsert(
        {
          id: taskStatusId,
          asset_id: assetId,
          task_id: norm(systemTask.id),
          status: 'Done',
          completed_at: completedAtIso,
          log_id: logId,
          start_date: statusRow?.start_date || completedAtIso,
        },
        { onConflict: 'id' },
      );
      if (upErr) throw new BadRequestException(upErr.message);
    }

    await recalculateAssetTaskStatuses(client, assetId, workflows);
    void this.projectListService.invalidateCachesForAssetMutation(accessToken, body.userId, assetId);
    return { ok: true };
  }

  async triggerSystemTaskBatch(
    accessToken: string,
    body: { userId: number; assetIds: string[]; triggerEvent: string },
  ) {
    await this.assertTaskMutation(accessToken, body.userId);
    const assetIds = Array.isArray(body.assetIds) ? body.assetIds.map((id) => norm(id)).filter(Boolean) : [];
    for (const assetId of assetIds) {
      await this.triggerSystemTask(accessToken, {
        userId: body.userId,
        assetId,
        triggerEvent: body.triggerEvent,
      });
    }
    return { ok: true, count: assetIds.length };
  }

  async getAssetTaskStatusesForAsset(
    accessToken: string,
    body: { userId: number; assetId: string },
  ): Promise<{ statuses: Record<string, unknown>[] }> {
    await this.assertTaskRead(accessToken, body.userId);
    const assetId = norm(body.assetId);
    if (!assetId) throw new BadRequestException('assetId is required');

    const { client } = await this.authContext.getRlsClient(accessToken, body.userId);
    const { data, error } = await client
      .from('asset_task_statuses')
      .select('*')
      .eq('asset_id', assetId);
    if (error) throw new BadRequestException(`asset_task_statuses: ${error.message}`);

    const statuses = (data ?? []).map((row) => normAssetTaskStatusRow(row));
    return { statuses };
  }

  async getTaskLogsForAsset(
    accessToken: string,
    body: { userId: number; assetId: string },
  ): Promise<{ logs: Record<string, unknown>[] }> {
    await this.assertTaskRead(accessToken, body.userId);
    const assetId = norm(body.assetId);
    if (!assetId) throw new BadRequestException('assetId is required');

    const { client } = await this.authContext.getRlsClient(accessToken, body.userId);
    const { data, error } = await client
      .from('task_logs')
      .select('*')
      .eq('asset_id', assetId);
    if (error) throw new BadRequestException(`task_logs: ${error.message}`);

    const logs = (data ?? []).map((row) => normTaskLogRow(row));
    return { logs };
  }

  async getTaskLogsForAssetIds(
    accessToken: string,
    body: { userId: number; assetIds: string[] },
  ): Promise<{ logs: Record<string, unknown>[] }> {
    await this.assertTaskRead(accessToken, body.userId);
    const assetIds = (body.assetIds ?? []).map((id) => norm(id)).filter(Boolean);
    if (assetIds.length === 0) return { logs: [] };

    const { client } = await this.authContext.getRlsClient(accessToken, body.userId);
    const rows = await fetchRecordsByAssetIds(client, 'task_logs', assetIds);
    return { logs: rows.map((row) => normTaskLogRow(row)) };
  }

  async getAssetTaskStatusesForAssetIds(
    accessToken: string,
    body: { userId: number; assetIds: string[] },
  ): Promise<{ statuses: Record<string, unknown>[] }> {
    await this.assertTaskRead(accessToken, body.userId);
    const assetIds = (body.assetIds ?? []).map((id) => norm(id)).filter(Boolean);
    if (assetIds.length === 0) return { statuses: [] };

    const { client } = await this.authContext.getRlsClient(accessToken, body.userId);
    const rows = await fetchRecordsByAssetIds(client, 'asset_task_statuses', assetIds);
    return { statuses: rows.map((row) => normAssetTaskStatusRow(row)) };
  }

  async getMomsForAsset(
    accessToken: string,
    body: { userId: number; assetId: string },
  ): Promise<{ moms: Record<string, unknown>[] }> {
    await this.assertTaskRead(accessToken, body.userId);
    const assetId = norm(body.assetId);
    if (!assetId) throw new BadRequestException('assetId is required');

    const { client } = await this.authContext.getRlsClient(accessToken, body.userId);
    const { data, error } = await client
      .from('moms')
      .select('*')
      .eq('asset_id', assetId);
    if (error) throw new BadRequestException(`moms: ${error.message}`);

    const moms = (data ?? []).map((row) => toCamelCase(row));
    return { moms };
  }
}
