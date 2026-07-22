import type { AdhocTask, MOM, SystemTriggerEvent } from '../types';
import { isCapexBeConfigured, postToCapexBe } from '../lib/capexBeClient';
import { getAccessTokenForBackend } from '../lib/authSession';
import { resolveMyTasksAccessToken } from './myTasksApi';

async function resolveToken(): Promise<string | null> {
  return resolveMyTasksAccessToken(getAccessTokenForBackend);
}

async function postTaskAction<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T | null> {
  if (!isCapexBeConfigured()) return null;
  try {
    const token = await resolveToken();
    return await postToCapexBe<T>(path, body, token);
  } catch {
    return null;
  }
}

export async function fetchAssetTaskStatusesForAssetFromBackend(
  userId: number,
  assetId: string,
): Promise<import('../types').AssetTaskStatus[] | null> {
  const result = await postTaskAction<{ statuses?: import('../types').AssetTaskStatus[] }>(
    '/task-actions/asset-task-statuses-for-asset',
    { userId, assetId },
  );
  return result?.statuses ?? null;
}

export async function fetchTaskLogsForAssetFromBackend(
  userId: number,
  assetId: string,
): Promise<import('../types').TaskLog[] | null> {
  const result = await postTaskAction<{ logs?: import('../types').TaskLog[] }>(
    '/task-actions/task-logs-for-asset',
    { userId, assetId },
  );
  return result?.logs ?? null;
}

export async function fetchTaskLogsForAssetIdsFromBackend(
  userId: number,
  assetIds: string[],
): Promise<import('../types').TaskLog[] | null> {
  if (!assetIds.length) return [];
  const result = await postTaskAction<{ logs?: import('../types').TaskLog[] }>(
    '/task-actions/task-logs-for-asset-ids',
    { userId, assetIds },
  );
  return result?.logs ?? null;
}

export async function fetchAssetTaskStatusesForAssetIdsFromBackend(
  userId: number,
  assetIds: string[],
): Promise<import('../types').AssetTaskStatus[] | null> {
  if (!assetIds.length) return [];
  const result = await postTaskAction<{ statuses?: import('../types').AssetTaskStatus[] }>(
    '/task-actions/asset-task-statuses-for-asset-ids',
    { userId, assetIds },
  );
  return result?.statuses ?? null;
}

export async function fetchMomsForAssetFromBackend(
  userId: number,
  assetId: string,
): Promise<import('../types').MOM[] | null> {
  const result = await postTaskAction<{ moms?: import('../types').MOM[] }>(
    '/task-actions/moms-for-asset',
    { userId, assetId },
  );
  return result?.moms ?? null;
}

export async function recalculateAssetViaBackend(
  userId: number,
  assetId: string,
): Promise<boolean> {
  const result = await postTaskAction<{ ok?: boolean }>('/task-actions/recalculate-asset', {
    userId,
    assetId,
  });
  return result?.ok === true;
}

export async function saveMomViaBackend(userId: number, mom: MOM): Promise<MOM | null> {
  const result = await postTaskAction<{ mom?: MOM }>('/task-actions/save-mom', {
    userId,
    mom,
  });
  return result?.mom ?? null;
}

export async function saveAdhocTaskViaBackend(
  userId: number,
  task: AdhocTask,
): Promise<AdhocTask | null> {
  const result = await postTaskAction<{ task?: AdhocTask }>('/task-actions/save-adhoc', {
    userId,
    task,
  });
  return result?.task ?? null;
}

export async function rescheduleTaskViaBackend(params: {
  userId: number;
  assetId: string;
  taskId: string;
  days: number;
  reason: string;
}): Promise<{ success: boolean; message: string } | null> {
  return postTaskAction('/task-actions/reschedule', params);
}

export async function updateSlaOverrideViaBackend(params: {
  userId: number;
  assetId: string;
  taskId: string;
  slaDays: number | null;
}): Promise<{ success: boolean; message: string } | null> {
  return postTaskAction('/task-actions/update-sla-override', params);
}

export async function triggerSystemTaskViaBackend(params: {
  userId: number;
  assetId: string;
  triggerEvent: SystemTriggerEvent;
  completedAt?: string;
}): Promise<boolean> {
  const result = await postTaskAction<{ ok?: boolean }>('/task-actions/trigger-system', params);
  return result?.ok === true;
}

export async function triggerSystemTaskBatchViaBackend(params: {
  userId: number;
  assetIds: string[];
  triggerEvent: SystemTriggerEvent;
}): Promise<boolean> {
  const result = await postTaskAction<{ ok?: boolean }>('/task-actions/trigger-system-batch', params);
  return result?.ok === true;
}
