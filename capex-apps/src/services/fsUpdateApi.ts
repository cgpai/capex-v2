import type {
  ArchetypeConfig,
  AssetTaskStatus,
  AssetTypeConfig,
  AssetTypeGroupConfig,
  BudgetPeriod,
  FeasibilityStudy,
  HospitalUnitConfig,
  Task,
} from '../types';
import { getAccessTokenForBackend } from '../lib/authSession';
import { isCapexBeConfigured, postToCapexBe } from '../lib/capexBeClient';
import { trackBackendFetch } from '../lib/backendFetchTelemetry';
import { resolveMyTasksAccessToken } from './myTasksApi';

export type FsUpdateBundle = {
  period: BudgetPeriod | null;
  archetypes: ArchetypeConfig[];
  hus: HospitalUnitConfig[];
  assetTypes: AssetTypeConfig[];
  assetTypeGroups: AssetTypeGroupConfig[];
  assetTaskStatuses: AssetTaskStatus[];
  tasks: Task[];
  studies: FeasibilityStudy[];
  summary?: {
    totalProjects: number;
    totalAssets: number;
    totalStudies: number;
  };
};

export type FsProjectSavePatch = {
  id: string;
  axCode?: string | null;
  approvedBudget?: number;
  targetBudgetStart?: string | null;
  budgetRevenuePermonth?: number;
};

export type FsSaveResult = { ok: true } | { ok: false; error: string };

export async function fetchFsUpdateBundleFromBackend(
  periodName: string,
  userId: number,
): Promise<FsUpdateBundle | null> {
  if (!periodName.trim()) return null;

  if (!isCapexBeConfigured()) {
    trackBackendFetch('fsUpdate.bundle', 'fallback', { reason: 'missing_base_url' });
    return null;
  }

  const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);

  try {
    const data = await postToCapexBe<Partial<FsUpdateBundle>>(
      '/fs-update/page-bundle',
      { periodName: periodName.trim(), userId },
      accessToken,
    );
    trackBackendFetch('fsUpdate.bundle', 'success');
    return {
      period: data?.period ?? null,
      archetypes: Array.isArray(data?.archetypes) ? data.archetypes : [],
      hus: Array.isArray(data?.hus) ? data.hus : [],
      assetTypes: Array.isArray(data?.assetTypes) ? data.assetTypes : [],
      assetTypeGroups: Array.isArray(data?.assetTypeGroups) ? data.assetTypeGroups : [],
      assetTaskStatuses: Array.isArray(data?.assetTaskStatuses) ? data.assetTaskStatuses : [],
      tasks: Array.isArray(data?.tasks) ? data.tasks : [],
      studies: Array.isArray(data?.studies) ? data.studies : [],
      summary: data?.summary as FsUpdateBundle['summary'],
    };
  } catch (err) {
    trackBackendFetch('fsUpdate.bundle', 'fallback', {
      reason: 'http_error',
      httpStatus: err instanceof Error && 'status' in err ? (err as { status: number }).status : undefined,
    });
    return null;
  }
}

export async function saveFsProjectsViaBackend(
  userId: number,
  periodName: string,
  projects: FsProjectSavePatch[],
): Promise<FsSaveResult> {
  if (!isCapexBeConfigured() || projects.length === 0) {
    return { ok: false, error: 'Backend tidak dikonfigurasi atau tidak ada data untuk disimpan.' };
  }

  const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);

  try {
    await postToCapexBe<{ ok?: boolean }>(
      '/fs-update/save',
      { userId, periodName: periodName.trim(), projects },
      accessToken,
    );
    trackBackendFetch('fsUpdate.save', 'success');
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal menyimpan FS via backend.';
    trackBackendFetch('fsUpdate.save', 'fallback', { reason: 'http_error' });
    return { ok: false, error: message };
  }
}
