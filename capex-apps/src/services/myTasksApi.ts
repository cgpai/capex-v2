import type { UserTask } from '../types';
import { CapexBeHttpError, isCapexBeConfigured, postToCapexBe, useBeBffProxy } from '../lib/capexBeClient';
import { useBackendSession } from '../lib/auth/authConstants';

export { isCapexBeConfigured, CapexBeHttpError };

/** Single round-trip: workflow + ad-hoc tasks for the user, scoped by budget period when provided. */
export async function fetchMyTasks(
  userId: number,
  accessToken?: string | null,
  periodName?: string,
): Promise<UserTask[]> {
  const data = await postToCapexBe<{ tasks: UserTask[] }>(
    '/my-tasks',
    { userId, periodName: periodName?.trim() || undefined },
    accessToken,
  );
  return data.tasks ?? [];
}

export async function completeWorkflowTaskViaBe(params: {
  userId: number;
  accessToken?: string | null;
  assetId: string;
  taskId: string;
  remark: string;
  roleId: number;
  completedAt?: string;
}): Promise<{ success: boolean; message: string }> {
  return postToCapexBe(
    '/task-actions/complete-workflow',
    {
      userId: params.userId,
      assetId: params.assetId,
      taskId: params.taskId,
      remark: params.remark,
      roleId: params.roleId,
      ...(params.completedAt ? { completedAt: params.completedAt } : {}),
    },
    params.accessToken,
  );
}

export async function completeAdhocTaskViaBe(params: {
  userId: number;
  accessToken?: string | null;
  adhocTaskId: string;
  remark: string;
}): Promise<{ success: boolean; message: string }> {
  return postToCapexBe(
    '/task-actions/complete-adhoc',
    {
      userId: params.userId,
      adhocTaskId: params.adhocTaskId,
      remark: params.remark,
    },
    params.accessToken,
  );
}

export async function revertTaskViaBe(params: {
  userId: number;
  accessToken?: string | null;
  assetId: string;
  taskId: string;
}): Promise<{ success: boolean; message: string }> {
  return postToCapexBe(
    '/task-actions/revert-to-open',
    { userId: params.userId, assetId: params.assetId, taskId: params.taskId },
    params.accessToken,
  );
}

export async function reportNotYetDoneViaBe(params: {
  userId: number;
  accessToken?: string | null;
  assetId: string;
  taskId: string;
}): Promise<{ success: boolean; message: string }> {
  return postToCapexBe(
    '/task-actions/report-not-yet-done',
    { userId: params.userId, assetId: params.assetId, taskId: params.taskId },
    params.accessToken,
  );
}

export async function withdrawReportViaBe(params: {
  userId: number;
  accessToken?: string | null;
  assetId: string;
  taskId: string;
}): Promise<{ success: boolean; message: string }> {
  return postToCapexBe(
    '/task-actions/withdraw-report',
    { userId: params.userId, assetId: params.assetId, taskId: params.taskId },
    params.accessToken,
  );
}

export async function updateTaskRemarkViaBe(params: {
  userId: number;
  accessToken?: string | null;
  assetId: string;
  taskId: string;
  remark: string;
}): Promise<{
  success: boolean;
  message: string;
  remark?: string;
  remarkEditHistory?: Array<{
    editedAt: string;
    editedByUserId?: number;
    editedByUsername?: string;
    previousRemark: string;
    newRemark: string;
  }>;
}> {
  return postToCapexBe(
    '/task-actions/update-remark',
    {
      userId: params.userId,
      assetId: params.assetId,
      taskId: params.taskId,
      remark: params.remark,
    },
    params.accessToken,
  );
}

export async function upsertFsApprovalViaBe(params: {
  userId: number;
  accessToken?: string | null;
  projectId: string;
  conclusion: string;
  amount?: number;
  followUpAction?: string | null;
  fsType?: string;
}): Promise<{ success: boolean; study?: Record<string, unknown>; fsStatus?: string }> {
  return postToCapexBe(
    '/task-actions/upsert-fs-approval',
    {
      userId: params.userId,
      projectId: params.projectId,
      conclusion: params.conclusion,
      amount: params.amount,
      followUpAction: params.followUpAction,
      fsType: params.fsType,
    },
    params.accessToken,
  );
}

/** Bearer for BE when BFF cannot rely on httpOnly cookies alone. */
export async function resolveMyTasksAccessToken(
  getAccessToken: () => Promise<string | null>,
): Promise<string | null> {
  if (useBeBffProxy() && useBackendSession()) return null;
  return getAccessToken();
}
