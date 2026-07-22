import type {
  AssetTagConfig,
  AssetTaskStatus,
  EnrichedAsset,
  HospitalUnitConfig,
  Project,
  ProjectPriorityConfig,
  TaskLog,
  UserRole,
  WorkflowSet,
} from '../types';
import { getAccessTokenForBackend } from '../lib/authSession';
import { trackBackendFetch } from '../lib/backendFetchTelemetry';
import { isCapexBeConfigured, postToCapexBe } from '../lib/capexBeClient';
import { resolveMyTasksAccessToken } from './myTasksApi';

export type BddConstructionBundle = {
  assets: EnrichedAsset[];
  projects: Project[];
  hus: HospitalUnitConfig[];
  priorities: ProjectPriorityConfig[];
  tags: AssetTagConfig[];
  workflows: WorkflowSet[];
  roles: UserRole[];
  taskLogs: TaskLog[];
  assetTaskStatuses: AssetTaskStatus[];
};

export async function fetchBddConstructionBundleFromBackend(
  userId: number,
  periodName?: string,
): Promise<BddConstructionBundle | null> {
  if (!isCapexBeConfigured()) {
    trackBackendFetch('bddConstruction.bundle', 'fallback', { reason: 'missing_base_url' });
    return null;
  }

  try {
    const token = await resolveMyTasksAccessToken(getAccessTokenForBackend);
    const data = await postToCapexBe<Partial<BddConstructionBundle>>(
      '/bdd-construction/page-bundle',
      {
        userId,
        ...(periodName?.trim() ? { periodName: periodName.trim() } : {}),
      },
      token,
    );
    trackBackendFetch('bddConstruction.bundle', 'success');
    return {
      assets: Array.isArray(data?.assets) ? data.assets : [],
      projects: Array.isArray(data?.projects) ? data.projects : [],
      hus: Array.isArray(data?.hus) ? data.hus : [],
      priorities: Array.isArray(data?.priorities) ? data.priorities : [],
      tags: Array.isArray(data?.tags) ? data.tags : [],
      workflows: Array.isArray(data?.workflows) ? data.workflows : [],
      roles: Array.isArray(data?.roles) ? data.roles : [],
      taskLogs: Array.isArray(data?.taskLogs) ? data.taskLogs : [],
      assetTaskStatuses: Array.isArray(data?.assetTaskStatuses) ? data.assetTaskStatuses : [],
    };
  } catch {
    trackBackendFetch('bddConstruction.bundle', 'fallback', { reason: 'network_error' });
    return null;
  }
}
