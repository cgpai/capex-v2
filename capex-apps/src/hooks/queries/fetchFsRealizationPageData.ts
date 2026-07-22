import type { QueryClient } from '@tanstack/react-query';
import type { BudgetCategoryConfig, BudgetPeriod, FeasibilityStudy } from '@/types';
import * as budgetService from '@/services/budgetService';
import * as configService from '@/services/configService';
import * as fsService from '@/services/fsService';
import {
  fetchFsApprovalBundleFromBackend,
  fetchFsRealizationBundleFromBackend,
} from '@/services/fsApi';
import { readPageSnapshot, readPageSnapshotAnyAge, writePageSnapshot } from '@/lib/pageSnapshotCache';
import { queryKeys } from '@/lib/query-keys';
import type { EnrichedFS } from './fetchFsApprovalPageData';
import {
  filterNrFeasibilityStudies,
  isApprovedFsConclusion,
  isNewRevenueGeneratingCategory,
} from '@/screens/FSRealizationPage/fsRealizationHelpers';

const FS_REALIZATION_STALE_MS = 120_000;
const FS_REALIZATION_SNAPSHOT_KEY = 'fs-realization';

export type { EnrichedFS };

export type FsRealizationPageData = {
  periodName: string;
  allFS: EnrichedFS[];
};

const normProjectId = (id: unknown): string => (id == null ? '' : String(id).trim());

function enrichApprovedFSList(
  period: BudgetPeriod | null | undefined,
  rawFS: FeasibilityStudy[],
  categories: BudgetCategoryConfig[],
): EnrichedFS[] {
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
  const fsByProject = new Map<string, FeasibilityStudy>();

  for (const fs of rawFS) {
    const key = normProjectId(fs.projectId);
    if (!key) continue;
    const existing = fsByProject.get(key);
    if (!existing) {
      fsByProject.set(key, fs);
      continue;
    }
    const fsApproved = isApprovedFsConclusion(fs.conclusion);
    const existingApproved = isApprovedFsConclusion(existing.conclusion);
    if (fsApproved && !existingApproved) {
      fsByProject.set(key, fs);
      continue;
    }
    if (fsApproved === existingApproved) {
      const fsTs = String(fs.updatedAt || '');
      const exTs = String(existing.updatedAt || '');
      if (fsTs >= exTs) fsByProject.set(key, fs);
    }
  }

  const enrichedFSList: EnrichedFS[] = [];

  if (period) {
    period.archetypes.forEach((archetype) => {
      archetype.units.forEach((unit) => {
        unit.projects.forEach((project) => {
          const fs = fsByProject.get(normProjectId(project.id));
          const categoryName = categoryMap.get(project.budgetCategoryId) || 'Unknown';
          if (
            fs &&
            isApprovedFsConclusion(fs.conclusion) &&
            isNewRevenueGeneratingCategory(categoryName, project.budgetCategoryId)
          ) {
            enrichedFSList.push({
              ...fs,
              archetypeName: archetype.name,
              huName: unit.name,
              projectName: project.projectName,
              capexCategoryName: categoryName,
            });
          }
        });
      });
    });
  }

  return enrichedFSList;
}

function filterNrApprovedFromApprovalBundle(allFS: EnrichedFS[]): EnrichedFS[] {
  return allFS.filter(
    (fs) =>
      isApprovedFsConclusion(fs.conclusion) &&
      isNewRevenueGeneratingCategory(fs.capexCategoryName),
  );
}

async function loadFsRealizationRows(periodName: string, userId: number): Promise<EnrichedFS[]> {
  const beBundle = await fetchFsRealizationBundleFromBackend(periodName, userId);
  if (beBundle?.allFS?.length) {
    return filterNrFeasibilityStudies(beBundle.allFS);
  }

  const approvalBundle = await fetchFsApprovalBundleFromBackend(periodName, userId);
  if (approvalBundle?.allFS?.length) {
    const fromApproval = filterNrApprovedFromApprovalBundle(approvalBundle.allFS);
    if (fromApproval.length > 0) return fromApproval;
  }

  const [period, rawFS, categories] = await Promise.all([
    budgetService.getBudgetByPeriodName(periodName),
    fsService.getAllFeasibilityStudies({ userId }),
    configService.getAllBudgetCategories(),
  ]);

  return enrichApprovedFSList(period, rawFS, categories);
}

export async function fetchFsRealizationPageData(
  periodName: string,
  userId: number,
): Promise<FsRealizationPageData | null> {
  if (!periodName) return null;

  const allFS = await loadFsRealizationRows(periodName, userId);
  const out: FsRealizationPageData = {
    periodName,
    allFS,
  };

  if (allFS.length > 0) {
    writePageSnapshot(`${FS_REALIZATION_SNAPSHOT_KEY}:${periodName}:${userId}`, out);
  }

  return out;
}

function normalizeFsRealizationSnapshot(
  cached: FsRealizationPageData | null,
  periodName: string,
): FsRealizationPageData | null {
  if (!cached || cached.periodName !== periodName) return null;
  if (!Array.isArray(cached.allFS) || cached.allFS.length === 0) return null;
  return cached;
}

export function readFsRealizationSnapshot(periodName: string, userId: number): FsRealizationPageData | null {
  return normalizeFsRealizationSnapshot(
    readPageSnapshot<FsRealizationPageData>(`${FS_REALIZATION_SNAPSHOT_KEY}:${periodName}:${userId}`),
    periodName,
  );
}

export function readFsRealizationSnapshotAnyAge(periodName: string, userId: number): FsRealizationPageData | null {
  return normalizeFsRealizationSnapshot(
    readPageSnapshotAnyAge<FsRealizationPageData>(`${FS_REALIZATION_SNAPSHOT_KEY}:${periodName}:${userId}`),
    periodName,
  );
}

export function hydrateFsRealizationPageFromDisk(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
): boolean {
  if (!periodName.trim() || !Number.isFinite(userId)) return false;
  const disk = readFsRealizationSnapshotAnyAge(periodName, userId);
  if (!disk) return false;
  queryClient.setQueryData(queryKeys.fsRealization.page(periodName, userId), disk);
  return true;
}

export function resolveFsRealizationInitialData(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
): FsRealizationPageData | undefined {
  if (!periodName.trim()) return undefined;
  return (
    queryClient.getQueryData<FsRealizationPageData>(queryKeys.fsRealization.page(periodName, userId)) ??
    readFsRealizationSnapshot(periodName, userId) ??
    undefined
  );
}

export function prefetchFsRealizationPage(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
): Promise<void> {
  if (!periodName.trim()) return Promise.resolve();
  hydrateFsRealizationPageFromDisk(queryClient, periodName, userId);
  const key = queryKeys.fsRealization.page(periodName, userId);
  if (queryClient.getQueryState(key)?.fetchStatus === 'fetching') {
    return Promise.resolve();
  }
  return queryClient
    .prefetchQuery({
      queryKey: key,
      queryFn: () => fetchFsRealizationPageData(periodName, userId),
      staleTime: FS_REALIZATION_STALE_MS,
    })
    .then(() => undefined)
    .catch(() => undefined);
}
