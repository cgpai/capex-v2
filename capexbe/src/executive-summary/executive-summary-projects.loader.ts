import type { SupabaseClient } from '@supabase/supabase-js';
import { toCamelCase } from '../project-list/supabase-helpers';
import type { ExecutiveSummaryProjectsQuery } from './executive-summary.dto';
import {
  applyExecutiveSummaryFilters,
  countAssetsByProjectIds,
  projectListSelect,
} from './executive-summary-query.util';

export type ExecutiveSummaryProjectRowDto = {
  id: string;
  projectName: string;
  projectCode: string;
  huCode: string;
  huName: string;
  archetypeName: string;
  segment: string;
  assetCount: number;
  status: number;
  completionRate: number;
  revenueProjection: number;
  targetStart: string | null;
  endDate: string | null;
  taskToDo: string | null;
  owner: string;
  approvedBudget: number;
  isPipelineProject: boolean;
  type: string;
};

export type ExecutiveSummaryProjectsPageResult = {
  rows: ExecutiveSummaryProjectRowDto[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  totalRevenue: number;
  distinctHuCount: number;
};

function mapSegment(type: string, isPipeline: boolean): string {
  if (isPipeline || type === 'Project Pipeline') return 'Pipeline';
  if (type === 'Strategic Projects') return 'Strategic';
  return 'General';
}

function mapRow(raw: Record<string, unknown>, assetCount: number): ExecutiveSummaryProjectRowDto {
  const hu = (raw.hospital_units_config ?? {}) as Record<string, unknown>;
  const arch = (hu.archetypes_config ?? {}) as Record<string, unknown>;
  const camel = toCamelCase(raw) as Record<string, unknown>;
  const huCamel = toCamelCase(hu) as Record<string, unknown>;
  const isPipeline = Boolean(camel.isPipelineProject);
  const type = String(camel.type ?? '');
  return {
    id: String(camel.id ?? ''),
    projectName: String(camel.projectName ?? ''),
    projectCode: String(camel.projectCode ?? ''),
    huCode: String(huCamel.code ?? ''),
    huName: String(huCamel.name ?? ''),
    archetypeName: String(arch.name ?? toCamelCase(arch).name ?? ''),
    segment: mapSegment(type, isPipeline),
    assetCount,
    status: Number(camel.status ?? 0),
    completionRate: Number(camel.completionRate ?? 0),
    revenueProjection: Number(camel.revenueProjection ?? 0),
    targetStart: camel.targetStart != null ? String(camel.targetStart) : null,
    endDate: camel.endDate != null ? String(camel.endDate) : null,
    taskToDo: camel.taskToDo != null ? String(camel.taskToDo) : null,
    owner: String(camel.owner ?? ''),
    approvedBudget: Number(camel.approvedBudget ?? 0),
    isPipelineProject: isPipeline,
    type,
  };
}

export async function loadExecutiveSummaryProjectsPage(
  client: SupabaseClient,
  query: ExecutiveSummaryProjectsQuery,
): Promise<ExecutiveSummaryProjectsPageResult> {
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  let listQuery = client
    .from('projects')
    .select(projectListSelect(), { count: 'exact' })
    .eq('period_name', query.periodName.trim());
  listQuery = applyExecutiveSummaryFilters(listQuery, query.periodName, query, query.search) as typeof listQuery;
  listQuery = listQuery.order(query.sortBy, { ascending: query.sortDir === 'asc' });

  const { data, error, count } = await listQuery.range(from, to);
  if (error) throw new Error(`projects page: ${error.message}`);

  const rawRows = (data || []) as unknown as Record<string, unknown>[];
  const projectIds = rawRows.map((r) => String((r as { id: string }).id));
  const assetCounts = await countAssetsByProjectIds(client, projectIds);
  const rows = rawRows.map((r) => mapRow(r, assetCounts.get(String((r as { id: string }).id)) || 0));

  const totalCount = count ?? 0;
  const hasMore = from + rows.length < totalCount;

  return {
    rows,
    page: query.page,
    pageSize: query.pageSize,
    totalCount,
    hasMore,
    totalRevenue: 0,
    distinctHuCount: 0,
  };
}
