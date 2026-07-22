import type { QueryClient } from '@tanstack/react-query';
import type { BudgetCategoryConfig, BudgetPeriod, FeasibilityStudy } from '@/types';
import * as budgetService from '@/services/budgetService';
import * as configService from '@/services/configService';
import * as fsService from '@/services/fsService';
import { fetchFsApprovalBundleFromBackend } from '@/services/fsApi';
import { readPageSnapshot, readPageSnapshotAnyAge, writePageSnapshot } from '@/lib/pageSnapshotCache';
import { queryKeys } from '@/lib/query-keys';

const FS_APPROVAL_STALE_MS = 120_000;
const FS_APPROVAL_SNAPSHOT_KEY = 'fs-approval';

export type EnrichedFS = FeasibilityStudy & {
    archetypeName: string;
    huName: string;
    projectName: string;
    capexCategoryName: string;
};

export type FsApprovalPageData = {
    periodName: string;
    allFS: EnrichedFS[];
};

/** Stable join key — project id types may differ between projects vs feasibility_studies rows. */
const normProjectId = (id: unknown): string => (id == null ? '' : String(id).trim());

function enrichFSList(
    period: BudgetPeriod | null | undefined,
    rawFS: FeasibilityStudy[],
    categories: BudgetCategoryConfig[],
): EnrichedFS[] {
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
    const fsMap = new Map(rawFS.map((fs) => [normProjectId(fs.projectId), fs]));
    const enrichedFSList: EnrichedFS[] = [];

    if (period) {
        period.archetypes.forEach((archetype) => {
            archetype.units.forEach((unit) => {
                unit.projects.forEach((project) => {
                    const fs = fsMap.get(normProjectId(project.id));
                    if (fs) {
                        enrichedFSList.push({
                            ...fs,
                            archetypeName: archetype.name,
                            huName: unit.name,
                            projectName: project.projectName,
                            capexCategoryName: categoryMap.get(project.budgetCategoryId) || 'Unknown',
                        });
                    }
                });
            });
        });
    }

    return enrichedFSList;
}

export async function fetchFsApprovalPageData(
    periodName: string,
    userId: number,
): Promise<FsApprovalPageData | null> {
    if (!periodName) return null;

    const beBundle = await fetchFsApprovalBundleFromBackend(periodName, userId);
    let allFS: EnrichedFS[] = [];
    if (beBundle) {
        // Fast path: use backend pre-joined rows for first paint.
        allFS = Array.isArray(beBundle.allFS) ? beBundle.allFS : [];
    } else {
        // Fallback path only when backend bundle is unavailable.
        const [period, rawFS, categories] = await Promise.all([
            budgetService.getBudgetByPeriodName(periodName),
            fsService.getAllFeasibilityStudies({ userId }),
            configService.getAllBudgetCategories(),
        ]);
        allFS = enrichFSList(period, rawFS, categories);
    }

    const out: FsApprovalPageData = {
        periodName,
        allFS,
    };

    writePageSnapshot(`${FS_APPROVAL_SNAPSHOT_KEY}:${periodName}:${userId}`, out);

    return out;
}

function normalizeFsApprovalSnapshot(
    cached: FsApprovalPageData | null,
    periodName: string,
): FsApprovalPageData | null {
    if (!cached || cached.periodName !== periodName) return null;
    return cached;
}

export function readFsApprovalSnapshot(periodName: string, userId: number): FsApprovalPageData | null {
    return normalizeFsApprovalSnapshot(
        readPageSnapshot<FsApprovalPageData>(`${FS_APPROVAL_SNAPSHOT_KEY}:${periodName}:${userId}`),
        periodName,
    );
}

export function readFsApprovalSnapshotAnyAge(periodName: string, userId: number): FsApprovalPageData | null {
    return normalizeFsApprovalSnapshot(
        readPageSnapshotAnyAge<FsApprovalPageData>(`${FS_APPROVAL_SNAPSHOT_KEY}:${periodName}:${userId}`),
        periodName,
    );
}

export function hydrateFsApprovalPageFromDisk(
    queryClient: QueryClient,
    periodName: string,
    userId: number,
): boolean {
    if (!periodName.trim() || !Number.isFinite(userId)) return false;
    const disk = readFsApprovalSnapshotAnyAge(periodName, userId);
    if (!disk) return false;
    queryClient.setQueryData(queryKeys.fsApproval.page(periodName, userId), disk);
    return true;
}

export function resolveFsApprovalInitialData(
    queryClient: QueryClient,
    periodName: string,
    userId: number,
): FsApprovalPageData | undefined {
    if (!periodName.trim()) return undefined;
    return (
        queryClient.getQueryData<FsApprovalPageData>(queryKeys.fsApproval.page(periodName, userId)) ??
        readFsApprovalSnapshot(periodName, userId) ??
        undefined
    );
}

export function prefetchFsApprovalPage(
    queryClient: QueryClient,
    periodName: string,
    userId: number,
): Promise<void> {
    if (!periodName.trim()) return Promise.resolve();
    hydrateFsApprovalPageFromDisk(queryClient, periodName, userId);
    const key = queryKeys.fsApproval.page(periodName, userId);
    if (queryClient.getQueryState(key)?.fetchStatus === 'fetching') {
        return Promise.resolve();
    }
    return queryClient
        .prefetchQuery({
            queryKey: key,
            queryFn: () => fetchFsApprovalPageData(periodName, userId),
            staleTime: FS_APPROVAL_STALE_MS,
        })
        .then(() => undefined)
        .catch(() => undefined);
}
