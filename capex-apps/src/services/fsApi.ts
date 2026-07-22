import type { BudgetCategoryConfig, FeasibilityStudy, FSRealization } from '../types';
import { postBackend } from '../lib/backendApiClient';
import { getAccessTokenForBackend } from '../lib/authSession';
import { isCapexBeConfigured, postToCapexBe } from '../lib/capexBeClient';
import { trackBackendFetch } from '../lib/backendFetchTelemetry';
import { resolveMyTasksAccessToken } from './myTasksApi';
import type { EnrichedFS } from '../hooks/queries/fetchFsApprovalPageData';

export type FsApprovalBundle = {
  periodName: string;
  allFS: EnrichedFS[];
  categories: BudgetCategoryConfig[];
  summary?: {
    totalFs: number;
  };
};

export type FsRealizationBundle = {
  periodName: string;
  allFS: EnrichedFS[];
  categories: BudgetCategoryConfig[];
  summary?: {
    totalFs: number;
    approvedFs: number;
  };
};

function normalizeBundleAllFs(data: Partial<{ allFS?: EnrichedFS[]; all_fs?: EnrichedFS[] }>): EnrichedFS[] {
  if (Array.isArray(data.allFS)) return data.allFS;
  const snake = (data as { all_fs?: EnrichedFS[] }).all_fs;
  return Array.isArray(snake) ? snake : [];
}

async function postFsPageBundle<T extends { allFS: EnrichedFS[] }>(
  path: string,
  source: string,
  periodName: string,
  userId: number,
): Promise<T | null> {
  if (!periodName.trim()) return null;
  if (!isCapexBeConfigured()) {
    trackBackendFetch(source, 'fallback', { reason: 'missing_base_url' });
    return null;
  }

  const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
  try {
    const data = await postToCapexBe<Partial<T>>(path, { periodName: periodName.trim(), userId }, accessToken);
    trackBackendFetch(source, 'success');
    return {
      ...data,
      periodName: (data as { periodName?: string }).periodName ?? periodName,
      allFS: normalizeBundleAllFs(data as Partial<{ allFS?: EnrichedFS[]; all_fs?: EnrichedFS[] }>),
    } as unknown as T;
  } catch (err) {
    trackBackendFetch(source, 'fallback', {
      reason: 'http_error',
      httpStatus: err instanceof Error && 'status' in err ? (err as { status: number }).status : undefined,
    });
    return null;
  }
}

export async function fetchFsApprovalBundleFromBackend(
  periodName: string,
  userId: number,
): Promise<FsApprovalBundle | null> {
  const data = await postFsPageBundle<FsApprovalBundle>(
    '/fs-approval/page-bundle',
    'fsApproval.bundle',
    periodName,
    userId,
  );
  if (!data) return null;
  return {
    periodName: data.periodName ?? periodName,
    allFS: data.allFS,
    categories: Array.isArray(data.categories) ? data.categories : [],
    summary: data.summary,
  };
}

export async function fetchFsRealizationBundleFromBackend(
  periodName: string,
  userId: number,
): Promise<FsRealizationBundle | null> {
  const data = await postFsPageBundle<FsRealizationBundle>(
    '/fs-realization/page-bundle',
    'fsRealization.bundle',
    periodName,
    userId,
  );
  if (!data) return null;
  return {
    periodName: data.periodName ?? periodName,
    allFS: data.allFS,
    categories: Array.isArray(data.categories) ? data.categories : [],
    summary: data.summary,
  };
}

export async function fetchFsStudiesFromBackend(userId: number): Promise<FeasibilityStudy[] | null> {
  const data = await postBackend<{ studies?: FeasibilityStudy[] }>(
    '/fs/feasibility-studies/list',
    { userId },
    { source: 'fs.studies.list' },
  );
  if (!data) return null;
  return Array.isArray(data.studies) ? data.studies : [];
}

export async function fetchFsStudyByIdFromBackend(
  userId: number,
  id: string,
): Promise<FeasibilityStudy | null> {
  if (!id.trim()) return null;
  return postBackend<FeasibilityStudy>(
    '/fs/feasibility-studies/get',
    { userId, id: id.trim() },
    { source: 'fs.studies.get' },
  );
}

export async function createFsStudyViaBackend(
  userId: number,
  payload: Omit<FeasibilityStudy, 'createdAt' | 'updatedAt'>,
): Promise<FeasibilityStudy | null> {
  return postBackend<FeasibilityStudy>(
    '/fs/feasibility-studies/create',
    { userId, payload },
    { source: 'fs.studies.create', timeoutMs: 8_000 },
  );
}

export async function updateFsStudyViaBackend(
  userId: number,
  id: string,
  updates: Partial<FeasibilityStudy>,
): Promise<FeasibilityStudy | null> {
  return postBackend<FeasibilityStudy>(
    '/fs/feasibility-studies/update',
    { userId, id, updates },
    { source: 'fs.studies.update', timeoutMs: 8_000 },
  );
}

export async function fetchFsRealizationsFromBackend(
  userId: number,
  fsId: string,
): Promise<FSRealization[] | null> {
  const data = await postBackend<{ realizations?: FSRealization[] }>(
    '/fs/realizations/list',
    { userId, fsId },
    { source: 'fs.realizations.list' },
  );
  if (!data) return null;
  return Array.isArray(data.realizations) ? data.realizations : [];
}

export async function saveFsRealizationViaBackend(
  userId: number,
  payload: FSRealization,
): Promise<FSRealization | null> {
  return postBackend<FSRealization>(
    '/fs/realizations/save',
    { userId, payload },
    { source: 'fs.realizations.save', timeoutMs: 8_000 },
  );
}
