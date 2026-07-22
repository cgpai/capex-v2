import { toCamelCase } from '../project-list/supabase-helpers';

export type DuplicateProjectHit = {
  id: string;
  projectCode: string;
  projectName: string;
  hospitalUnitId: string;
  huName?: string;
  matchScore: number;
};

export type DuplicateAssetHit = {
  id: string;
  assetCode: string;
  assetName: string;
  projectId: string;
  projectCode?: string;
  projectName?: string;
  categoryId?: string;
  categoryName?: string;
  hospitalUnitId?: string;
  matchScore: number;
};

export function mapProjectRowToHit(
  row: Record<string, unknown>,
  huNameById: Map<string, string>,
  matchScore: number,
): DuplicateProjectHit {
  const id = String(row.id ?? '');
  return {
    id,
    projectCode: String(row.projectCode ?? row.project_code ?? ''),
    projectName: String(row.projectName ?? row.project_name ?? ''),
    hospitalUnitId: String(row.hospitalUnitId ?? row.hospital_unit_id ?? ''),
    huName: huNameById.get(String(row.hospitalUnitId ?? row.hospital_unit_id ?? '')),
    matchScore,
  };
}

export function mapAssetRowToHit(
  row: Record<string, unknown>,
  projectMeta: { projectCode?: string; projectName?: string; hospitalUnitId?: string } | null,
  categoryNameById: Map<string, string>,
  matchScore: number,
): DuplicateAssetHit {
  const categoryId = String(row.budgetCategoryId ?? row.budget_category_id ?? '');
  return {
    id: String(row.id ?? ''),
    assetCode: String(row.assetCode ?? row.asset_code ?? ''),
    assetName: String(row.assetName ?? row.asset_name ?? ''),
    projectId: String(row.projectId ?? row.project_id ?? ''),
    projectCode: projectMeta?.projectCode,
    projectName: projectMeta?.projectName,
    categoryId: categoryId || undefined,
    categoryName: categoryId ? categoryNameById.get(categoryId) : undefined,
    hospitalUnitId: projectMeta?.hospitalUnitId,
    matchScore,
  };
}

export function mapDbProjectToDto(row: Record<string, unknown>, assets: Record<string, unknown>[]): Record<string, unknown> {
  const project = toCamelCase(row) as Record<string, unknown>;
  const mappedAssets = assets.map((a) => toCamelCase(a));
  return {
    ...project,
    assets: mappedAssets,
  };
}

export function mapDbAssetToDto(row: Record<string, unknown>): Record<string, unknown> {
  return toCamelCase(row) as Record<string, unknown>;
}
