import type {
  ArchetypeConfig,
  AssetTaskStatus,
  EnrichedAsset,
  HospitalUnitConfig,
  Project,
  ProjectPriorityConfig,
  Task,
  TaskLog,
} from '../types';
import { getAccessTokenForBackend } from '../lib/authSession';
import { useBackendSession } from '../lib/auth/authConstants';
import { authenticatedFetch } from '../lib/auth/authenticatedFetch';
import { capexBeRequestUrl, useBeBffProxy } from '../lib/capexBeClient';
import { resolveMyTasksAccessToken } from './myTasksApi';
import { trackBackendFetch } from '../lib/backendFetchTelemetry';

export type GrUpdateBundle = {
  assets: EnrichedAsset[];
  archetypes: ArchetypeConfig[];
  hus: HospitalUnitConfig[];
  projects: Project[];
  priorities: ProjectPriorityConfig[];
  statuses: AssetTaskStatus[];
  tasks: Task[];
  taskLogs: TaskLog[];
};

export async function fetchGrUpdateBundleFromBackend(
  userId: number,
): Promise<GrUpdateBundle | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const bff = useBeBffProxy();

  if (!bff && !(process.env.NEXT_PUBLIC_CAPEXBE_URL || '').trim()) {
    trackBackendFetch('grUpdate.bundle', 'fallback', { reason: 'missing_base_url' });
    return null;
  }

  try {
    const token = bff ? null : await getAccessTokenForBackend();
    if (!bff && !token) {
      trackBackendFetch('grUpdate.bundle', 'fallback', { reason: 'missing_access_token' });
      return null;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await (bff ? authenticatedFetch : fetch)(capexBeRequestUrl('/gr-update/page-bundle'), {
      method: 'POST',
      signal: controller.signal,
      headers,
      credentials: bff || useBackendSession() ? 'include' : 'same-origin',
      body: JSON.stringify({ userId }),
      ...(bff ? { retryOn401: true } : {}),
    });
    if (!res.ok) {
      trackBackendFetch('grUpdate.bundle', 'fallback', { reason: 'http_error', httpStatus: res.status });
      return null;
    }
    const data = (await res.json()) as Partial<GrUpdateBundle> | null;
    trackBackendFetch('grUpdate.bundle', 'success');
    return {
      assets: Array.isArray(data?.assets) ? data.assets : [],
      archetypes: Array.isArray(data?.archetypes) ? data.archetypes : [],
      hus: Array.isArray(data?.hus) ? data.hus : [],
      projects: Array.isArray(data?.projects) ? data.projects : [],
      priorities: Array.isArray(data?.priorities) ? data.priorities : [],
      statuses: Array.isArray(data?.statuses) ? data.statuses : [],
      tasks: Array.isArray(data?.tasks) ? data.tasks : [],
      taskLogs: Array.isArray(data?.taskLogs) ? data.taskLogs : [],
    };
  } catch {
    trackBackendFetch('grUpdate.bundle', 'fallback', { reason: 'network_error' });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export type GrAssetSavePatch = {
  id: string;
  projectId: string;
  poNumber?: string | null;
  consumedBudget?: number;
  isGoodsReceived?: boolean;
  receivedQty?: number;
  qty?: number;
  assetCode?: string;
  assetName?: string;
  description?: string;
  budgetPlan?: number;
  budgetAllocated?: number;
  workflowSetId?: string;
  budgetCategoryId?: string;
  endTargetDate?: string | null;
  catalogueId?: string | null;
  bddPriority?: string | null;
  assetTypeId?: string | null;
  lifecycleStatus?: string | null;
};

export async function saveGrAssetsViaBackend(
  userId: number,
  assets: GrAssetSavePatch[],
): Promise<boolean> {
  if (assets.length === 0) return false;
  const bff = useBeBffProxy();
  const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
  if (!bff && !base) return false;

  const token = await resolveMyTasksAccessToken(getAccessTokenForBackend);
  if (!bff && !useBackendSession() && !token) return false;

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await (bff ? authenticatedFetch : fetch)(capexBeRequestUrl('/gr-update/save'), {
      method: 'POST',
      headers,
      credentials: bff || useBackendSession() ? 'include' : 'same-origin',
      body: JSON.stringify({ userId, assets }),
      ...(bff ? { retryOn401: true } : {}),
    });
    trackBackendFetch('grUpdate.save', res.ok ? 'success' : 'fallback', {
      httpStatus: res.status,
    });
    return res.ok;
  } catch {
    trackBackendFetch('grUpdate.save', 'fallback', { reason: 'network_error' });
    return false;
  }
}
