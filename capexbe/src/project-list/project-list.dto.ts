import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  parseProjectListSortBy,
  type ProjectListSortBy,
} from './project-list-sort.util';
import { PROJECT_LIST_DATA_POLICY } from './project-list-query.util';
import { sanitizePostgrestSearchTerm } from '../shared/postgrest-filter.util';

export type { ProjectListSortBy };

export type ProjectListBudgetFilter = 'low' | 'high' | null;

export type ProjectListQueryFilters = {
  sortBy: ProjectListSortBy;
  search: string;
  huNames: string[];
  archetypeName: string | null;
  assetTypeGroupName: string | null;
  priorityNames: string[];
  budgetCategoryIds: string[];
  budgetFilter: ProjectListBudgetFilter;
  completionMin: number;
  completionMax: number;
  finishedTasks: string[];
  /** RBAC — resolved on server from user record when omitted. */
  scopeAll?: boolean;
  scopeHuNames?: string[];
  scopeArchetypeNames?: string[];
  /** BDD Construction screen — only infrastructure / construction assets. */
  bddConstructionOnly?: boolean;
  /** Hide assets without BDD priority (non-BDD roles). */
  hideUnassignedBdd?: boolean;
};

export type ProjectListQueryBody = ProjectListQueryFilters & {
  userId: number;
  periodName: string;
  page: number;
  pageSize: number;
  skipCache?: boolean;
  /** Excel export — allows pageSize above table UI cap (still bounded). */
  exportAll?: boolean;
};

const TABLE_MAX_PAGE_SIZE = 500;
const EXPORT_MAX_PAGE_SIZE = 50_000;

const BUDGET_THRESHOLD = 300_000_000;

export function parseProjectListQueryBody(body: unknown): ProjectListQueryBody {
  const b = (body ?? {}) as Record<string, unknown>;
  const userId = Number(b.userId);
  if (!Number.isFinite(userId)) throw new BadRequestException('Invalid userId');
  const periodName = String(b.periodName ?? '').trim();
  if (!periodName) throw new BadRequestException('periodName is required');

  const page = Math.max(1, Math.floor(Number(b.page) || 1));
  const exportAll = b.exportAll === true;
  const maxPageSize = exportAll ? EXPORT_MAX_PAGE_SIZE : TABLE_MAX_PAGE_SIZE;
  const pageSize = Math.min(maxPageSize, Math.max(1, Math.floor(Number(b.pageSize) || 25)));

  const search = sanitizePostgrestSearchTerm(String(b.search ?? ''));
  const archetypeName =
    b.archetypeName != null && String(b.archetypeName).trim()
      ? String(b.archetypeName).trim()
      : null;
  const assetTypeGroupName =
    b.assetTypeGroupName != null && String(b.assetTypeGroupName).trim()
      ? String(b.assetTypeGroupName).trim()
      : null;

  const huNames = Array.isArray(b.huNames)
    ? b.huNames.map((n) => String(n).trim()).filter(Boolean)
    : [];
  const priorityNames = Array.isArray(b.priorityNames)
    ? b.priorityNames.map((n) => String(n).trim()).filter(Boolean)
    : [];
  const budgetCategoryIds = Array.isArray(b.budgetCategoryIds)
    ? b.budgetCategoryIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const finishedTasks = Array.isArray(b.finishedTasks)
    ? b.finishedTasks.map((t) => String(t).trim()).filter(Boolean)
    : [];

  let budgetFilter: ProjectListBudgetFilter = null;
  const bf = String(b.budgetFilter ?? '').trim().toLowerCase();
  if (bf === 'low' || bf === 'high') budgetFilter = bf;

  const completionMin = Math.max(0, Math.min(100, Math.floor(Number(b.completionMin) || 0)));
  const completionMax = Math.max(0, Math.min(100, Math.floor(Number(b.completionMax) || 100)));
  const min = Math.min(completionMin, completionMax);
  const max = Math.max(completionMin, completionMax);

  return {
    userId,
    periodName,
    page,
    pageSize,
    skipCache: Boolean(b.skipCache),
    exportAll,
    sortBy: parseProjectListSortBy(b.sortBy),
    search,
    huNames,
    archetypeName,
    assetTypeGroupName,
    priorityNames,
    budgetCategoryIds,
    budgetFilter,
    completionMin: min,
    completionMax: max,
    finishedTasks,
    scopeAll: b.scopeAll === true,
    scopeHuNames: Array.isArray(b.scopeHuNames)
      ? b.scopeHuNames.map((n) => String(n).trim()).filter(Boolean)
      : undefined,
    scopeArchetypeNames: Array.isArray(b.scopeArchetypeNames)
      ? b.scopeArchetypeNames.map((n) => String(n).trim()).filter(Boolean)
      : undefined,
    bddConstructionOnly: b.bddConstructionOnly === true,
    hideUnassignedBdd: b.hideUnassignedBdd === true,
  };
}

export function projectListQueryCacheKey(userId: number, periodName: string, query: ProjectListQueryBody): string {
  const { page, pageSize, skipCache: _s, exportAll: _e, userId: _u, periodName: _p, ...filters } = query;
  const hash = createHash('sha256')
    .update(JSON.stringify({ dataPolicy: PROJECT_LIST_DATA_POLICY, ...filters, page, pageSize }))
    .digest('hex')
    .slice(0, 16);
  const pn = periodName.trim().toLowerCase();
  return `app:table:project-list:query:${userId}:${pn}:${hash}`;
}

export { BUDGET_THRESHOLD };
