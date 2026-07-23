import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRecords, normId, toCamelCase } from '../project-list/supabase-helpers';
import { loadBudgetByPeriodName } from '../budget-hu/budget-period.loader';

export type EnrichedFsRow = {
  id: string;
  projectId: string;
  fsType: string;
  amount: number;
  irr: number;
  paybackPeriod: number;
  npv: number;
  roi: number;
  plannedRevenueStartDate: string;
  actualRevenueStartDate?: string | null;
  monthlyRevenuePlan: number;
  conclusion: string;
  followUpAction?: string | null;
  createdAt?: string;
  updatedAt?: string;
  archetypeName: string;
  huName: string;
  projectName: string;
  capexCategoryName: string;
  budgetCategoryId?: string;
};

const APPROVED_CONCLUSIONS = new Set(['Approved', 'Approved with Notes']);

/** Budget category NR — New Revenue Generating only. */
export const NR_BUDGET_CATEGORY_ID = 'cat-new-rev-gen';

export function isNewRevenueGeneratingCategory(categoryName: string, categoryId?: string): boolean {
  if (categoryId === NR_BUDGET_CATEGORY_ID) return true;
  const normalized = String(categoryName || '').trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'nr') return true;
  return normalized.includes('new revenue');
}

export function filterNrFeasibilityStudies(rows: EnrichedFsRow[]): EnrichedFsRow[] {
  return rows.filter(
    (fs) =>
      APPROVED_CONCLUSIONS.has(String(fs.conclusion || '')) &&
      isNewRevenueGeneratingCategory(fs.capexCategoryName, fs.budgetCategoryId),
  );
}

function buildFsMap(rawStudies: any[]): Map<string, any> {
  const map = new Map<string, any>();
  for (const fs of rawStudies) {
    const key = normId(fs.projectId);
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, fs);
      continue;
    }
    const fsApproved = APPROVED_CONCLUSIONS.has(String(fs.conclusion || ''));
    const existingApproved = APPROVED_CONCLUSIONS.has(String(existing.conclusion || ''));
    if (fsApproved && !existingApproved) {
      map.set(key, fs);
      continue;
    }
    if (fsApproved === existingApproved) {
      const fsTs = String(fs.updatedAt || fs.updated_at || '');
      const exTs = String(existing.updatedAt || existing.updated_at || '');
      if (fsTs >= exTs) map.set(key, fs);
    }
  }
  return map;
}

export function enrichFsForPeriod(
  period: any | null,
  rawStudies: any[],
  categories: any[],
  filterApprovedOnly = false,
): EnrichedFsRow[] {
  const categoryMap = new Map(categories.map((c: any) => [c.id, c.name]));
  const fsMap = buildFsMap(rawStudies);
  const enriched: EnrichedFsRow[] = [];

  if (!period?.archetypes) return enriched;

  for (const archetype of period.archetypes) {
    for (const unit of archetype.units || []) {
      for (const project of unit.projects || []) {
        const fs = fsMap.get(normId(project.id));
        if (!fs) continue;
        if (filterApprovedOnly && !APPROVED_CONCLUSIONS.has(String(fs.conclusion || ''))) continue;

        enriched.push({
          ...fs,
          archetypeName: archetype.name,
          huName: unit.name,
          projectName: project.projectName,
          capexCategoryName: categoryMap.get(project.budgetCategoryId) || 'Unknown',
          budgetCategoryId: project.budgetCategoryId,
        });
      }
    }
  }

  return enriched;
}

export async function loadFsPeriodContext(
  client: SupabaseClient,
  periodName: string,
): Promise<{ period: any | null; categories: any[]; studies: any[] }> {
  const pn = periodName.trim();
  const [period, categoriesRaw] = await Promise.all([
    loadBudgetByPeriodName(client, pn, { fsView: true }),
    fetchAllRecords(client, 'budget_category_configs', '*'),
  ]);
  const projectIds: string[] = [];
  for (const archetype of period?.archetypes || []) {
    for (const hu of archetype.units || []) {
      for (const project of hu.projects || []) {
        projectIds.push(normId(project.id));
      }
    }
  }
  const studiesRaw: any[] = [];
  if (projectIds.length > 0) {
    const chunkSize = 150;
    for (let i = 0; i < projectIds.length; i += chunkSize) {
      const chunk = projectIds.slice(i, i + chunkSize);
      const { data, error } = await client.from('feasibility_studies').select('*').in('project_id', chunk);
      if (error) throw new Error(`feasibility_studies(project_id in): ${error.message}`);
      if (data?.length) studiesRaw.push(...data);
    }
  }

  return {
    period,
    categories: categoriesRaw ? categoriesRaw.map(toCamelCase) : [],
    studies: studiesRaw ? studiesRaw.map(toCamelCase) : [],
  };
}
