import type { UserTask } from '@/types';
import {
  buildScopedArchetypeOptions,
  buildScopedHuOptions,
  type UserScopesShape,
} from '@/lib/scopedFilterOptions';
import { AdhocTaskStatus, TaskCurrentStatus } from '@/types';

export { buildScopedArchetypeOptions, buildScopedHuOptions };
export type { UserScopesShape };

export type MyTaskSortOption =
  | 'targetDate_desc'
  | 'targetDate_asc'
  | 'startDate_desc'
  | 'startDate_asc'
  | 'huName_asc';

export const MY_TASK_SORT_OPTIONS: { label: string; value: MyTaskSortOption }[] = [
  { label: 'Target Date (Newest First)', value: 'targetDate_desc' },
  { label: 'Target Date (Oldest First)', value: 'targetDate_asc' },
  { label: 'Task Age (Newest First)', value: 'startDate_desc' },
  { label: 'Task Age (Oldest First)', value: 'startDate_asc' },
  { label: 'Hospital Unit (A-Z)', value: 'huName_asc' },
];

const MAX_SEARCH_LEN = 200;

export function sanitizeTaskSearchInput(raw: string): string {
  return raw.trim().slice(0, MAX_SEARCH_LEN);
}

/** Lightweight filter options from loaded tasks — instant before master config loads. */
export function buildTaskDerivedFilterOptions(tasks: UserTask[]): {
  archetypeNames: string[];
  huNames: string[];
} {
  const archetypes = new Set<string>();
  const hus = new Set<string>();
  for (const t of tasks) {
    if (t.archetypeName) archetypes.add(t.archetypeName);
    if (t.huName) hus.add(t.huName);
  }
  return {
    archetypeNames: Array.from(archetypes).sort((a, b) => a.localeCompare(b)),
    huNames: Array.from(hus).sort((a, b) => a.localeCompare(b)),
  };
}

export function mergeFilterOptionLists(primary: string[], fallback: string[]): string[] {
  if (primary.length > 0) return primary;
  return fallback;
}

export function filterMyTasksByUserScope(tasks: UserTask[], userScopes: UserScopesShape): UserTask[] {
  if (userScopes.all) return tasks;
  if (
    userScopes.archetypes.size === 0 &&
    userScopes.hus.size === 0 &&
    userScopes.archetypeIds.size === 0 &&
    userScopes.huIds.size === 0
  ) {
    return [];
  }

  return tasks.filter((task) => {
    const inArchetypeScope = userScopes.archetypes.has(task.archetypeName);
    const inHuScope = userScopes.hus.has(task.huName);
    return inArchetypeScope || inHuScope;
  });
}

export type MyTaskFilterState = {
  showCompleted: boolean;
  searchLower: string;
  selectedArchetypes: string[];
  selectedHUs: string[];
  sortBy: MyTaskSortOption;
};

function compareTasks(a: UserTask, b: UserTask, sortBy: MyTaskSortOption): number {
  switch (sortBy) {
    case 'targetDate_desc':
      return new Date(b.targetEndDate).getTime() - new Date(a.targetEndDate).getTime();
    case 'targetDate_asc':
      return new Date(a.targetEndDate).getTime() - new Date(b.targetEndDate).getTime();
    case 'startDate_desc':
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
    case 'startDate_asc':
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    case 'huName_asc':
      return a.huName.localeCompare(b.huName);
    default:
      return 0;
  }
}

export function filterAndSortMyTasks(tasks: UserTask[], filters: MyTaskFilterState): UserTask[] {
  const {
    showCompleted,
    searchLower,
    selectedArchetypes,
    selectedHUs,
    sortBy,
  } = filters;

  const archetypeSet =
    selectedArchetypes.length > 0 ? new Set(selectedArchetypes) : null;
  const huSet = selectedHUs.length > 0 ? new Set(selectedHUs) : null;

  const filtered: UserTask[] = [];
  for (const task of tasks) {
    const isDone =
      task.status === TaskCurrentStatus.Done || task.status === AdhocTaskStatus.Done;
    if (!showCompleted && isDone) continue;

    if (searchLower) {
      const match =
        task.taskName.toLowerCase().includes(searchLower) ||
        task.projectName.toLowerCase().includes(searchLower) ||
        task.assetName.toLowerCase().includes(searchLower) ||
        task.huName.toLowerCase().includes(searchLower) ||
        task.projectCode?.toLowerCase().includes(searchLower) ||
        (task.description?.toLowerCase().includes(searchLower) ?? false);
      if (!match) continue;
    }

    if (archetypeSet && !archetypeSet.has(task.archetypeName)) continue;
    if (huSet && !huSet.has(task.huName)) continue;

    filtered.push(task);
  }

  if (filtered.length <= 1) return filtered;
  return filtered.sort((a, b) => compareTasks(a, b, sortBy));
}

export function paginateTasks<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
