import { BadRequestException } from '@nestjs/common';
import { sanitizePostgrestSearchTerm } from '../shared/postgrest-filter.util';

export type CapexTypeFilter = 'all' | 'pipeline' | 'strategic' | 'general';
export type StatusFilter = 'all' | 'on-track' | 'at-risk' | 'off-track';
export type SortDir = 'asc' | 'desc';

export type ExecutiveSummaryListFilters = {
  archetypeId?: string;
  capexType: CapexTypeFilter;
  status: StatusFilter;
  huCodes: string[];
};

export type ExecutiveSummaryProjectsQuery = ExecutiveSummaryListFilters & {
  userId: number;
  periodName: string;
  page: number;
  pageSize: number;
  search: string;
  sortBy: string;
  sortDir: SortDir;
};

const SORTABLE = new Set([
  'project_name',
  'completion_rate',
  'revenue_projection',
  'status',
  'target_start',
  'end_date',
]);

export function parsePeriodUserBody(body: unknown): { userId: number; periodName: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const userId = Number(b.userId);
  if (!Number.isFinite(userId)) throw new BadRequestException('Invalid userId');
  const periodName = String(b.periodName ?? '').trim();
  if (!periodName) throw new BadRequestException('periodName is required');
  return { userId, periodName };
}

function parseCapexType(v: unknown): CapexTypeFilter {
  const s = String(v ?? 'all');
  if (s === 'new-facility') return 'all';
  if (s === 'pipeline' || s === 'strategic' || s === 'general' || s === 'all') return s;
  return 'all';
}

function parseStatusFilter(v: unknown): StatusFilter {
  const s = String(v ?? 'all');
  if (s === 'on-track' || s === 'at-risk' || s === 'off-track' || s === 'all') return s;
  return 'all';
}

export function parseListFilters(body: unknown): ExecutiveSummaryListFilters {
  const b = (body ?? {}) as Record<string, unknown>;
  const huRaw = b.huCodes;
  const huCodes = Array.isArray(huRaw)
    ? huRaw.map((c) => String(c).trim()).filter(Boolean)
    : [];
  const archetypeId = b.archetypeId != null && String(b.archetypeId).trim()
    ? String(b.archetypeId).trim()
    : undefined;
  return {
    archetypeId,
    capexType: parseCapexType(b.capexType),
    status: parseStatusFilter(b.status),
    huCodes,
  };
}

export function parseProjectsPageBody(body: unknown): ExecutiveSummaryProjectsQuery {
  const { userId, periodName } = parsePeriodUserBody(body);
  const filters = parseListFilters(body);
  const b = (body ?? {}) as Record<string, unknown>;
  const page = Math.max(1, Math.floor(Number(b.page) || 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(Number(b.pageSize) || 40)));
  const search = sanitizePostgrestSearchTerm(String(b.search ?? ''));
  const sortByRaw = String(b.sortBy ?? 'project_name').trim();
  const sortBy = SORTABLE.has(sortByRaw) ? sortByRaw : 'project_name';
  const sortDir: SortDir = String(b.sortDir ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
  return {
    userId,
    periodName,
    page,
    pageSize,
    search,
    sortBy,
    sortDir,
    ...filters,
  };
}
