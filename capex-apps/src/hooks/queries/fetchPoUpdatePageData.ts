import type { QueryClient } from '@tanstack/react-query';
import type { ArchetypeConfig, EnrichedAsset, HospitalUnitConfig, ProjectPriorityConfig } from '@/types';
import * as budgetService from '@/services/budgetService';
import * as configService from '@/services/configService';
import * as taskService from '@/services/taskService';
import { fetchPoUpdateBundleFromBackend } from '@/services/poUpdateApi';
import { isCapexBeConfigured } from '@/lib/capexBeClient';
import { readPageSnapshot, readPageSnapshotAnyAge, writePageSnapshot } from '@/lib/pageSnapshotCache';
import { queryKeys } from '@/lib/query-keys';

const PO_STALE_MS = 120_000;

const normalize = (value: unknown): string => String(value ?? '').trim().toLowerCase();
const PO_SNAPSHOT_KEY = 'po-update';

export type PoUpdatePageData = {
  assets: EnrichedAsset[];
  masterData: {
    archetypes: ArchetypeConfig[];
    hus: HospitalUnitConfig[];
    projects: unknown[];
    priorities: ProjectPriorityConfig[];
  };
  assetLastTaskMap: Record<string, string>;
  assetHasPOMap: Record<string, boolean>;
};

function buildPoMapsClientSide(
  assets: EnrichedAsset[],
  allTasks: Awaited<ReturnType<typeof configService.getAllTasks>>,
  allWorkflows: Awaited<ReturnType<typeof configService.getAllWorkflowSets>>,
  allTaskLogs: Awaited<ReturnType<typeof taskService.getAllTaskLogs>>,
): Pick<PoUpdatePageData, 'assetLastTaskMap' | 'assetHasPOMap'> {
  const poSentToVendorTask = allTasks.find(
    (t) => normalize(t.name) === 'po sent to vendor' || t.id === 'TASK-C-27',
  );
  const poSentToVendorTaskId = poSentToVendorTask?.id;
  const lastTaskMap = new Map<string, string>();
  const poMap = new Map<string, boolean>();
  const logsByAsset = allTaskLogs.reduce((acc, log) => {
    if (!acc.has(log.assetId)) acc.set(log.assetId, []);
    acc.get(log.assetId)!.push(log);
    return acc;
  }, new Map<string, typeof allTaskLogs>());
  const workflowsMap = new Map(allWorkflows.map((w) => [w.id, w]));

  assets.forEach((asset) => {
    const workflow = workflowsMap.get(asset.workflowSetId || '');
    const assetLogs = logsByAsset.get(asset.id) || [];
    if (poSentToVendorTaskId) {
      poMap.set(asset.id, assetLogs.some((log) => log.taskId === poSentToVendorTaskId));
    } else {
      poMap.set(asset.id, !!normalize(asset.poNumber));
    }
    if (workflow && assetLogs.length > 0) {
      const sortedLogs = [...assetLogs].sort(
        (a, b) => new Date(b.completedAt || 0).getTime() - new Date(a.completedAt || 0).getTime(),
      );
      const lastLog = sortedLogs[0];
      const step = workflow.steps.find((s) => s.taskId === lastLog.taskId);
      if (step) {
        const task = allTasks.find((t) => t.id === step.taskId);
        if (task) lastTaskMap.set(asset.id, task.name);
      }
    }
  });

  return {
    assetLastTaskMap: Object.fromEntries(lastTaskMap.entries()),
    assetHasPOMap: Object.fromEntries(poMap.entries()),
  };
}

export async function fetchPoUpdatePageData(
  userId: number,
  periodName?: string,
): Promise<PoUpdatePageData> {
  const period = periodName?.trim() || '';
  const beBundle = await fetchPoUpdateBundleFromBackend(userId, period);

  if (beBundle) {
    const out: PoUpdatePageData = {
      assets: beBundle.assets,
      masterData: {
        archetypes: beBundle.archetypes,
        hus: beBundle.hus,
        projects: beBundle.projects,
        priorities: beBundle.priorities,
      },
      assetLastTaskMap: beBundle.assetLastTaskMap ?? {},
      assetHasPOMap: beBundle.assetHasPOMap ?? {},
    };
    writePageSnapshot(`${PO_SNAPSHOT_KEY}:${period}:${userId}`, out);
    return out;
  }

  if (isCapexBeConfigured()) {
    throw new Error('Gagal memuat data PO Update dari backend.');
  }

  const [assets, archetypes, hus, projects, priorities, allTasks, allTaskLogs, allWorkflows] =
    await Promise.all([
      budgetService.getAllEnrichedAssets(undefined, period || undefined),
      configService.getAllArchetypesConfig(),
      configService.getAllHospitalUnitsConfig(),
      budgetService.getAllProjects(period || undefined),
      configService.getAllProjectPriorities(),
      configService.getAllTasks(),
      taskService.getAllTaskLogs(),
      configService.getAllWorkflowSets(),
    ]);

  const maps = buildPoMapsClientSide(assets, allTasks, allWorkflows, allTaskLogs);
  const out: PoUpdatePageData = {
    assets,
    masterData: { archetypes, hus, projects, priorities },
    ...maps,
  };

  writePageSnapshot(`${PO_SNAPSHOT_KEY}:${period}:${userId}`, out);
  return out;
}

/** Cache memori → session snapshot (tampil instan sebelum fetch). */
export function readPoUpdateSnapshotAnyAge(userId: number, periodName?: string): PoUpdatePageData | null {
  const period = periodName?.trim() || '';
  const cached = readPageSnapshotAnyAge<PoUpdatePageData>(`${PO_SNAPSHOT_KEY}:${period}:${userId}`);
  if (cached?.assets?.length) return cached;
  const legacy = readPageSnapshotAnyAge<PoUpdatePageData>(`${PO_SNAPSHOT_KEY}:${userId}`);
  return legacy?.assets?.length ? legacy : null;
}

export function resolvePoUpdateInitialData(
  queryClient: QueryClient,
  userId: number,
  periodName?: string,
): PoUpdatePageData | undefined {
  const period = periodName?.trim() || '';
  return (
    queryClient.getQueryData<PoUpdatePageData>(queryKeys.poUpdate.page(period, userId)) ??
    readPoUpdateSnapshot(userId, period) ??
    readPoUpdateSnapshotAnyAge(userId, period) ??
    undefined
  );
}

export function prefetchPoUpdatePage(
  queryClient: QueryClient,
  userId: number,
  periodName?: string,
): Promise<void> {
  const period = periodName?.trim() || '';
  if (queryClient.getQueryState(queryKeys.poUpdate.page(period, userId))?.fetchStatus === 'fetching') {
    return Promise.resolve();
  }
  return queryClient
    .prefetchQuery({
      queryKey: queryKeys.poUpdate.page(period, userId),
      queryFn: () => fetchPoUpdatePageData(userId, period),
      staleTime: PO_STALE_MS,
    })
    .then(() => undefined);
}

/** Baca snapshot disk untuk placeholder awal (opsional). */
export function readPoUpdateSnapshot(userId: number, periodName?: string): PoUpdatePageData | null {
  const period = periodName?.trim() || '';
  const cached = readPageSnapshot<PoUpdatePageData>(`${PO_SNAPSHOT_KEY}:${period}:${userId}`);
  if (!cached?.assets?.length) {
    const legacy = readPageSnapshot<PoUpdatePageData>(`${PO_SNAPSHOT_KEY}:${userId}`);
    if (legacy?.assets?.length) return legacy;
    return null;
  }
  return cached;
}

export function hydratePoUpdatePageFromDisk(
  queryClient: QueryClient,
  userId: number,
  periodName?: string,
): void {
  const period = periodName?.trim() || '';
  const snapshot =
    readPoUpdateSnapshot(userId, period) ?? readPoUpdateSnapshotAnyAge(userId, period);
  if (!snapshot?.assets?.length) return;
  queryClient.setQueryData(queryKeys.poUpdate.page(period, userId), snapshot);
}
