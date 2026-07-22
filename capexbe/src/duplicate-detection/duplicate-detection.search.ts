import type { SupabaseClient } from '@supabase/supabase-js';
import { sqlIlikePattern } from '../project-list/project-list-query.util';
import { sanitizePostgrestSearchTerm } from '../shared/postgrest-filter.util';
import { normalizeSearchText, scoreDuplicateMatch } from './duplicate-detection.normalize';
import {
  mapAssetRowToHit,
  mapProjectRowToHit,
  type DuplicateAssetHit,
  type DuplicateProjectHit,
} from './duplicate-detection.mapper';
import { toCamelCase } from '../project-list/supabase-helpers';

const CANDIDATE_CAP = 80;

type SearchOpts = {
  periodName: string;
  query: string;
  huId?: string;
  projectId?: string;
  excludeId?: string;
  cursor: number;
  limit: number;
};

export async function searchDuplicateProjects(
  client: SupabaseClient,
  opts: SearchOpts,
  huNameById: Map<string, string>,
): Promise<{ items: DuplicateProjectHit[]; nextCursor: string | null; total: number }> {
  const normalized = normalizeSearchText(sanitizePostgrestSearchTerm(opts.query));
  if (normalized.length < 2) {
    return { items: [], nextCursor: null, total: 0 };
  }

  const sqlPat = sqlIlikePattern(sanitizePostgrestSearchTerm(opts.query));
  const pn = opts.periodName.trim();
  const candidateMap = new Map<string, Record<string, unknown>>();

  for (const column of ['project_name', 'project_code'] as const) {
    let q = client.from('projects').select('*').eq('period_name', pn).ilike(column, sqlPat);
    if (opts.excludeId) q = q.neq('id', opts.excludeId);
    const { data, error } = await q.limit(CANDIDATE_CAP);
    if (error) throw new Error(`duplicate project search ${column}: ${error.message}`);
    for (const row of data || []) {
      candidateMap.set(String((row as { id: string }).id), row as Record<string, unknown>);
    }
  }

  const scored: DuplicateProjectHit[] = [];
  for (const row of candidateMap.values()) {
    const score = scoreDuplicateMatch(
      normalized,
      String(row.project_name ?? row.projectName ?? ''),
      String(row.project_code ?? row.projectCode ?? ''),
    );
    if (score < 50) continue;
    const hit = mapProjectRowToHit(row, huNameById, score);
    if (opts.huId && hit.hospitalUnitId === opts.huId) {
      hit.matchScore += 5;
    }
    scored.push(hit);
  }

  scored.sort((a, b) => b.matchScore - a.matchScore || a.projectCode.localeCompare(b.projectCode));
  const total = scored.length;
  const page = scored.slice(opts.cursor, opts.cursor + opts.limit);
  const nextCursor = opts.cursor + opts.limit < total ? String(opts.cursor + opts.limit) : null;
  return { items: page, nextCursor, total };
}

export async function searchDuplicateAssets(
  client: SupabaseClient,
  opts: SearchOpts,
  categoryNameById: Map<string, string>,
): Promise<{ items: DuplicateAssetHit[]; nextCursor: string | null; total: number }> {
  const normalized = normalizeSearchText(sanitizePostgrestSearchTerm(opts.query));
  if (normalized.length < 2) {
    return { items: [], nextCursor: null, total: 0 };
  }

  const sqlPat = sqlIlikePattern(sanitizePostgrestSearchTerm(opts.query));
  const pn = opts.periodName.trim();
  const candidateMap = new Map<string, Record<string, unknown>>();

  for (const column of ['asset_name', 'asset_code', 'description'] as const) {
    let q = client
      .from('assets')
      .select('*, projects!inner(id, project_code, project_name, hospital_unit_id, period_name)')
      .eq('projects.period_name', pn)
      .ilike(column, sqlPat);
    if (opts.excludeId) q = q.neq('id', opts.excludeId);
    const { data, error } = await q.limit(CANDIDATE_CAP);
    if (error) throw new Error(`duplicate asset search ${column}: ${error.message}`);
    for (const row of data || []) {
      candidateMap.set(String((row as { id: string }).id), row as Record<string, unknown>);
    }
  }

  const scored: DuplicateAssetHit[] = [];
  for (const row of candidateMap.values()) {
    const projectsRaw = row.projects;
    const projectRow = Array.isArray(projectsRaw) ? projectsRaw[0] : projectsRaw;
    const projectMeta = projectRow
      ? {
          projectCode: String((projectRow as { project_code?: string }).project_code ?? ''),
          projectName: String((projectRow as { project_name?: string }).project_name ?? ''),
          hospitalUnitId: String((projectRow as { hospital_unit_id?: string }).hospital_unit_id ?? ''),
        }
      : null;

    const flat = toCamelCase(row) as Record<string, unknown>;
    const score = scoreDuplicateMatch(
      normalized,
      String(flat.assetName ?? ''),
      String(flat.assetCode ?? ''),
      String(flat.description ?? ''),
    );
    if (score < 50) continue;
    const hit = mapAssetRowToHit(flat, projectMeta, categoryNameById, score);
    if (opts.projectId && hit.projectId === opts.projectId) {
      hit.matchScore += 8;
    } else if (opts.huId && hit.hospitalUnitId === opts.huId) {
      hit.matchScore += 4;
    }
    scored.push(hit);
  }

  scored.sort((a, b) => b.matchScore - a.matchScore || a.assetCode.localeCompare(b.assetCode));
  const total = scored.length;
  const page = scored.slice(opts.cursor, opts.cursor + opts.limit);
  const nextCursor = opts.cursor + opts.limit < total ? String(opts.cursor + opts.limit) : null;
  return { items: page, nextCursor, total };
}
