import type {
  AssetTagConfig,
  EnrichedAsset,
  Project,
  ProjectPriorityConfig,
  WorkflowSet,
} from '@/types';
import type { HospitalUnitConfig } from '@/types';
import { readBddConstructionTableCacheAnyAge } from '@/lib/bddConstructionDiskCache';
import { buildProjectListServerFilters } from '@/services/projectListQueryTypes';
import { bddConstructionFiltersCacheKey } from '@/lib/bddConstructionDiskCache';

export type BddConstructionPageData = {
  assets: EnrichedAsset[];
  projects: Project[];
  priorities: ProjectPriorityConfig[];
  tags: AssetTagConfig[];
  workflows: WorkflowSet[];
  roles: unknown[];
  hus: HospitalUnitConfig[];
  assetLastUpdateTaskMap: Record<string, { taskName: string; completedAt?: string }>;
};

/** @deprecated Use readBddConstructionTableCacheAnyAge via disk cache. */
export function readBddConstructionSnapshot(snapshotKey: string): Partial<BddConstructionPageData> | null {
  void snapshotKey;
  return null;
}

export function readBddConstructionPreload(
  periodName: string,
  userId: number,
  hideUnassignedBdd: boolean,
): ReturnType<typeof readBddConstructionTableCacheAnyAge> {
  if (!periodName.trim()) return null;
  const filtersKey = bddConstructionFiltersCacheKey({
    periodName,
    userId,
    page: 1,
    pageSize: 25,
    ...buildProjectListServerFilters({
      searchTerm: '',
      selectedHUs: [],
      meetingFilters: { archetype: null, assetTypeGroup: null },
      selectedPriorities: [],
      selectedBudgetCategoryIds: [],
      selectedBudgetFilter: null,
      selectedFinishedTasks: [],
      completionRange: { min: 0, max: 100 },
      userScopes: { all: true, hus: new Set(), archetypes: new Set() },
      bddConstructionOnly: true,
      hideUnassignedBdd,
    }),
  });
  return readBddConstructionTableCacheAnyAge(periodName, userId, filtersKey, 1, 25);
}
