import type { QueryClient } from '@tanstack/react-query';
import type {
  ArchetypeConfig,
  AssetTypeConfig,
  AssetTypeGroupConfig,
  BudgetPeriod,
  HospitalUnitConfig,
  Project,
} from '@/types';
import { TaskCurrentStatus } from '@/types';
import * as budgetService from '@/services/budgetService';
import * as configService from '@/services/configService';
import * as taskService from '@/services/taskService';
import * as fsService from '@/services/fsService';
import {
  fetchFsUpdateBundleFromBackend,
  type FsUpdateBundle,
} from '@/services/fsUpdateApi';
import { isCapexBeConfigured } from '@/lib/capexBeClient';
import { readPageSnapshot, readPageSnapshotAnyAge, writePageSnapshot } from '@/lib/pageSnapshotCache';
import { queryKeys } from '@/lib/query-keys';

const normalize = (value: unknown): string => String(value ?? '').trim().toLowerCase();
const FS_UPDATE_STALE_MS = 120_000;
const FS_SNAPSHOT_KEY = 'fs-update';

export type FsEnrichedProject = Project & {
  huName: string;
  archetypeName: string;
  archetypeId: string;
  fsApproval?: boolean;
  assetsNotFSApprovedCount?: number;
  fsStatus?: string;
  fsId?: string;
};

export type FsUpdatePageData = {
  periodName: string;
  allProjects: FsEnrichedProject[];
  editedData: FsEnrichedProject[];
  masterData: {
    archetypes: ArchetypeConfig[];
    hus: HospitalUnitConfig[];
    assetTypes: AssetTypeConfig[];
    assetTypeGroups: AssetTypeGroupConfig[];
  };
  assetFSApprovalMap: Record<string, boolean>;
  fsByProjectId: Record<string, { id: string; conclusion: string; amount: number }>;
};

/** FS `amount` is stored in Rp millions; convert to full IDR for display. */
export const FS_AMOUNT_MN_TO_IDR = 1_000_000;

function buildFsEnrichedProjectsFromBundle(beBundle: FsUpdateBundle) {
  const { period, assetTaskStatuses, tasks, studies } = beBundle;
  const fsApprovalTask = tasks.find(
    (t) => normalize(t.name) === 'fs approval' || t.id === 'TASK-C-06',
  );
  const fsApprovalTaskId = fsApprovalTask?.id;

  const assetFSApprovalStatusMap = new Map<string, boolean>();
  if (fsApprovalTaskId) {
    assetTaskStatuses.forEach((status) => {
      if (status.taskId === fsApprovalTaskId && status.status === TaskCurrentStatus.Done) {
        assetFSApprovalStatusMap.set(status.assetId, true);
      }
    });
  }

  const fsMap = new Map(studies.map((fs) => [fs.projectId, fs]));
  const enrichedProjects: FsEnrichedProject[] = [];

  if (period) {
    period.archetypes.forEach((archetype) => {
      archetype.units.forEach((unit) => {
        unit.projects.forEach((project) => {
          enrichedProjects.push({
            ...project,
            huName: unit.name,
            archetypeName: archetype.name,
            archetypeId: archetype.id,
          });
        });
      });
    });
  }

  const editedData = enrichedProjects.map((project) => {
    const assetsNotFSApproved = project.assets.filter((asset) => !assetFSApprovalStatusMap.get(asset.id));
    const fs = fsMap.get(project.id);
    return {
      ...project,
      fsApproval: (project.axCode && project.axCode.trim() !== '' && project.approvedBudget > 0) || false,
      assetsNotFSApprovedCount: assetsNotFSApproved.length,
      fsStatus: fs ? fs.conclusion : 'Not Submitted',
      fsId: fs?.id,
    };
  });

  return { allProjects: enrichedProjects, editedData, assetFSApprovalStatusMap };
}

function buildFsUpdatePageOutput(
  periodName: string,
  enriched: ReturnType<typeof buildFsEnrichedProjectsFromBundle>,
  beBundle: FsUpdateBundle,
): FsUpdatePageData {
  const fsByProjectId = Object.fromEntries(
    beBundle.studies.map((fs) => [
      fs.projectId,
      { id: fs.id, conclusion: fs.conclusion, amount: Number(fs.amount) || 0 },
    ]),
  );

  return {
    periodName,
    allProjects: enriched.allProjects,
    editedData: enriched.editedData,
    masterData: {
      archetypes: beBundle.archetypes,
      hus: beBundle.hus,
      assetTypes: beBundle.assetTypes,
      assetTypeGroups: beBundle.assetTypeGroups,
    },
    assetFSApprovalMap: Object.fromEntries(enriched.assetFSApprovalStatusMap.entries()),
    fsByProjectId,
  };
}

function buildFsUpdatePageFromLegacyFetch(
  periodName: string,
  period: BudgetPeriod | undefined,
  archetypes: ArchetypeConfig[],
  hus: HospitalUnitConfig[],
  assetTypes: AssetTypeConfig[],
  assetTypeGroups: AssetTypeGroupConfig[],
  allAssetStatuses: Awaited<ReturnType<typeof taskService.getAllAssetTaskStatuses>>,
  allTasks: Awaited<ReturnType<typeof configService.getAllTasks>>,
  allFS: Awaited<ReturnType<typeof fsService.getAllFeasibilityStudies>>,
): FsUpdatePageData {
  const fsApprovalTask = allTasks.find(
    (t) => normalize(t.name) === 'fs approval' || t.id === 'TASK-C-06',
  );
  const fsApprovalTaskId = fsApprovalTask?.id;

  const assetFSApprovalStatusMap = new Map<string, boolean>();
  if (fsApprovalTaskId) {
    allAssetStatuses.forEach((status) => {
      if (status.taskId === fsApprovalTaskId && status.status === TaskCurrentStatus.Done) {
        assetFSApprovalStatusMap.set(status.assetId, true);
      }
    });
  }

  const fsMap = new Map(allFS.map((fs) => [fs.projectId, fs]));
  const enrichedProjects: FsEnrichedProject[] = [];

  if (period) {
    period.archetypes.forEach((archetype) => {
      archetype.units.forEach((unit) => {
        unit.projects.forEach((project) => {
          enrichedProjects.push({
            ...project,
            huName: unit.name,
            archetypeName: archetype.name,
            archetypeId: archetype.id,
          });
        });
      });
    });
  }

  const editedData = enrichedProjects.map((project) => {
    const assetsNotFSApproved = project.assets.filter(
      (asset) => !assetFSApprovalStatusMap.get(asset.id),
    );
    const fs = fsMap.get(project.id);
    return {
      ...project,
      fsApproval: (project.axCode && project.axCode.trim() !== '' && project.approvedBudget > 0) || false,
      assetsNotFSApprovedCount: assetsNotFSApproved.length,
      fsStatus: fs ? fs.conclusion : 'Not Submitted',
      fsId: fs?.id,
    };
  });

  const fsByProjectId = Object.fromEntries(
    allFS.map((fs) => [
      fs.projectId,
      { id: fs.id, conclusion: fs.conclusion, amount: Number(fs.amount) || 0 },
    ]),
  );

  return {
    periodName,
    allProjects: enrichedProjects,
    editedData,
    masterData: { archetypes, hus, assetTypes, assetTypeGroups },
    assetFSApprovalMap: Object.fromEntries(assetFSApprovalStatusMap.entries()),
    fsByProjectId,
  };
}

export async function fetchFsUpdatePageData(
  periodName: string,
  userId: number,
): Promise<FsUpdatePageData | null> {
  if (!periodName) return null;

  const beBundle = await fetchFsUpdateBundleFromBackend(periodName, userId);
  if (beBundle) {
    const enriched = buildFsEnrichedProjectsFromBundle(beBundle);
    const out = buildFsUpdatePageOutput(periodName, enriched, beBundle);
    if (out.editedData.length > 0) {
      writePageSnapshot(`${FS_SNAPSHOT_KEY}:${periodName}:${userId}`, {
        periodName,
        allProjects: enriched.allProjects,
        editedData: enriched.editedData,
        masterData: out.masterData,
        fsByProjectId: out.fsByProjectId,
      });
    }
    return out;
  }

  if (isCapexBeConfigured()) {
    throw new Error('Gagal memuat data FS Update dari backend.');
  }

  const [period, archetypes, hus, assetTypes, assetTypeGroups, allAssetStatuses, allTasks, allFS] =
    await Promise.all([
      budgetService.getBudgetByPeriodName(periodName),
      configService.getAllArchetypesConfig(),
      configService.getAllHospitalUnitsConfig(),
      configService.getAllAssetTypeConfigs(),
      configService.getAllAssetTypeGroups(),
      taskService.getAllAssetTaskStatuses(),
      configService.getAllTasks(),
      fsService.getAllFeasibilityStudies({ userId }),
    ]);

  const out = buildFsUpdatePageFromLegacyFetch(
    periodName,
    period,
    archetypes,
    hus,
    assetTypes,
    assetTypeGroups,
    allAssetStatuses,
    allTasks,
    allFS,
  );

  if (out.editedData.length > 0) {
    writePageSnapshot(`${FS_SNAPSHOT_KEY}:${periodName}:${userId}`, {
      periodName,
      allProjects: out.allProjects,
      editedData: out.editedData,
      masterData: out.masterData,
      fsByProjectId: out.fsByProjectId,
    });
  }

  return out;
}

type FsUpdateSnapshotPayload = {
  periodName: string;
  allProjects: FsEnrichedProject[];
  editedData: FsEnrichedProject[];
  masterData: FsUpdatePageData['masterData'];
  fsByProjectId?: FsUpdatePageData['fsByProjectId'];
};

function normalizeFsUpdateSnapshot(
  cached: FsUpdateSnapshotPayload | null,
  periodName: string,
): FsUpdatePageData | null {
  if (!cached || cached.periodName !== periodName) return null;
  return {
    periodName: cached.periodName,
    allProjects: cached.allProjects,
    editedData: cached.editedData,
    masterData: cached.masterData,
    assetFSApprovalMap: {},
    fsByProjectId: cached.fsByProjectId ?? {},
  };
}

export function readFsUpdateSnapshot(periodName: string, userId: number): FsUpdatePageData | null {
  return normalizeFsUpdateSnapshot(
    readPageSnapshot<FsUpdateSnapshotPayload>(`${FS_SNAPSHOT_KEY}:${periodName}:${userId}`),
    periodName,
  );
}

export function readFsUpdateSnapshotAnyAge(periodName: string, userId: number): FsUpdatePageData | null {
  return normalizeFsUpdateSnapshot(
    readPageSnapshotAnyAge<FsUpdateSnapshotPayload>(`${FS_SNAPSHOT_KEY}:${periodName}:${userId}`),
    periodName,
  );
}

export function hydrateFsUpdatePageFromDisk(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
): boolean {
  if (!periodName.trim() || !Number.isFinite(userId)) return false;
  const disk = readFsUpdateSnapshotAnyAge(periodName, userId);
  if (!disk || (disk.editedData?.length ?? 0) === 0) return false;
  queryClient.setQueryData(queryKeys.fsUpdate.page(periodName, userId), disk);
  return true;
}

export function resolveFsUpdateInitialData(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
): FsUpdatePageData | undefined {
  if (!periodName.trim()) return undefined;
  const cached =
    queryClient.getQueryData<FsUpdatePageData>(queryKeys.fsUpdate.page(periodName, userId)) ??
    readFsUpdateSnapshot(periodName, userId) ??
    undefined;
  if ((cached?.editedData?.length ?? 0) > 0) return cached;
  return undefined;
}

export function prefetchFsUpdatePage(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
): Promise<void> {
  if (!periodName.trim()) return Promise.resolve();
  hydrateFsUpdatePageFromDisk(queryClient, periodName, userId);
  const key = queryKeys.fsUpdate.page(periodName, userId);
  if (queryClient.getQueryState(key)?.fetchStatus === 'fetching') {
    return Promise.resolve();
  }
  return queryClient
    .prefetchQuery({
      queryKey: key,
      queryFn: () => fetchFsUpdatePageData(periodName, userId),
      staleTime: FS_UPDATE_STALE_MS,
    })
    .then(() => undefined)
    .catch(() => undefined);
}
