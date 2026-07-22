import type { ExecutiveSummaryListFilters } from './executive-summary.dto';
import { buildSafeOrIlikeFilter, sanitizePostgrestSearchTerm } from '../shared/postgrest-filter.util';

const PROJECT_LIST_SELECT = `
  id,
  project_name,
  project_code,
  completion_rate,
  status,
  revenue_projection,
  target_start,
  end_date,
  type,
  is_pipeline_project,
  task_to_do,
  owner,
  approved_budget,
  hospital_unit_id,
  hospital_units_config!inner (
    code,
    name,
    archetype_id,
    archetypes_config ( name )
  )
`;

export function applyExecutiveSummaryFilters<
  T extends {
    eq: (col: string, val: unknown) => T;
    neq: (col: string, val: unknown) => T;
    in: (col: string, vals: string[]) => T;
    or: (expr: string) => T;
    ilike: (col: string, pat: string) => T;
  },
>(query: T, periodName: string, filters: ExecutiveSummaryListFilters, search: string): T {
  let q = query.eq('period_name', periodName.trim()) as T;

  if (filters.archetypeId) {
    q = q.eq('hospital_units_config.archetype_id', filters.archetypeId) as T;
  }

  if (filters.huCodes.length > 0) {
    q = q.in('hospital_units_config.code', filters.huCodes) as T;
  }

  if (filters.capexType === 'pipeline') {
    q = q.or('is_pipeline_project.eq.true,type.eq."Project Pipeline"') as T;
  } else if (filters.capexType === 'strategic') {
    q = q.eq('type', 'Strategic Projects').eq('is_pipeline_project', false) as T;
  } else if (filters.capexType === 'general') {
    q = q.eq('type', 'General & Routine Assets') as T;
  }

  if (filters.status === 'on-track') {
    q = q.eq('status', 0) as T;
  } else if (filters.status === 'at-risk') {
    q = q.eq('status', 1) as T;
  } else if (filters.status === 'off-track') {
    q = q.eq('status', 2) as T;
  }

  const orSearch = buildSafeOrIlikeFilter(['project_name', 'project_code'], search);
  if (orSearch) {
    q = q.or(orSearch) as T;
  }

  return q;
}

export function projectListSelect(): string {
  return PROJECT_LIST_SELECT;
}

export async function countAssetsByProjectIds(
  client: import('@supabase/supabase-js').SupabaseClient,
  projectIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (projectIds.length === 0) return counts;

  const unique = [...new Set(projectIds.map(String))];
  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await client
      .from('assets')
      .select('project_id')
      .in('project_id', chunk);
    if (error) throw new Error(`assets count: ${error.message}`);
    (data || []).forEach((row: { project_id: string }) => {
      const pid = String(row.project_id);
      counts.set(pid, (counts.get(pid) || 0) + 1);
    });
  }
  return counts;
}

export { sanitizePostgrestSearchTerm };
