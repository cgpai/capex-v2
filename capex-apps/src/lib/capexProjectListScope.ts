import { normAssetKey } from './assetKeys';
import type {
  ArchetypeConfig,
  EnrichedAsset,
  HospitalUnitConfig,
  Project,
  ProjectPriorityConfig,
  Task,
  User,
  UserRole,
  WorkflowSet,
} from '../types';
import type { ProjectListBundle } from '../services/capexProjectListApi';

/**
 * Sumber data daftar (sama seperti di CapexProjectListPage) — dipisah agar
 * scoping dapat dipakai saat inisialisasi useState (paint pertama tanpa delay).
 */
export type ListSource = {
  assets: EnrichedAsset[];
  projects: Project[];
  assetLastTaskMap: Record<string, string>;
  workflows: WorkflowSet[];
  archetypes: ArchetypeConfig[];
  hus: HospitalUnitConfig[];
  users: User[];
  priorities: ProjectPriorityConfig[];
  allRoles: UserRole[];
  allTasks: Task[];
  totalAssetCount?: number;
};

/** Client pool is safe for instant slicers only when all rows for the period are loaded. */
export function isCompleteListSource(source: ListSource): boolean {
  const rows = source.assets.length;
  if (rows === 0) return false;
  const total = source.totalAssetCount;
  if (typeof total === 'number' && total > rows) return false;
  return true;
}

/** After a full warm/export, align total with loaded rows (fixes RBAC-scoped pool totals). */
export function sealCompleteListSource(source: ListSource): ListSource {
  if (source.assets.length === 0) return source;
  return { ...source, totalAssetCount: source.assets.length };
}

export type UserScopesForCapex = {
  all: boolean;
  archetypes: Set<string>;
  hus: Set<string>;
  archetypeIds: Set<string>;
  huIds: Set<string>;
};

export function projectListBundleToListSource(bundle: ProjectListBundle): ListSource {
  return {
    assets: bundle.enrichedAssets,
    projects: bundle.projects,
    assetLastTaskMap: bundle.assetLastTaskMap,
    workflows: bundle.workflows,
    archetypes: bundle.archetypes,
    hus: bundle.hus,
    users: bundle.users,
    priorities: bundle.priorities,
    allRoles: bundle.allRoles,
    allTasks: bundle.allTasks,
    totalAssetCount: bundle.totalAssetCount,
  };
}

export function buildScopedListFromListSource(
  source: ListSource,
  userScopes: UserScopesForCapex,
): { scopedAssets: EnrichedAsset[]; scopedProjects: Project[]; scopedLastTaskMap: Map<string, string> } {
  const archetypeIdToName = new Map(source.archetypes.map((a) => [a.id, a.name] as [string, string]));
  const huIdToName = new Map(source.hus.map((h) => [h.id, h.name] as [string, string]));
  const effectiveScopedArchetypeNames = new Set<string>([
    ...Array.from(userScopes.archetypes),
    ...Array.from(userScopes.archetypeIds).map((id) => archetypeIdToName.get(id)).filter((n): n is string => !!n),
  ]);
  const effectiveScopedHuNames = new Set<string>([
    ...Array.from(userScopes.hus),
    ...Array.from(userScopes.huIds).map((id) => huIdToName.get(id)).filter((n): n is string => !!n),
  ]);

  const scopedAssets = userScopes.all
    ? source.assets
    : source.assets.filter(
        (asset) =>
          effectiveScopedHuNames.has(asset.huName) || effectiveScopedArchetypeNames.has(asset.archetypeName),
      );

  const scopedProjectIds = new Set(scopedAssets.map((a) => a.projectId));
  const scopedProjects = source.projects.filter((p) => scopedProjectIds.has(p.id));
  const lastByNorm = new Map<string, string>();
  Object.entries(source.assetLastTaskMap).forEach(([k, v]) => {
    lastByNorm.set(normAssetKey(k), v);
  });
  const scopedLastTaskMap = new Map<string, string>();
  scopedAssets.forEach((a) => {
    const nk = normAssetKey(a.id);
    const label = lastByNorm.get(nk);
    if (label != null) {
      scopedLastTaskMap.set(nk, label);
    }
  });

  return { scopedAssets, scopedProjects, scopedLastTaskMap };
}

/** Client-side RBAC belt when pool/cache predates server scope (no-op when scopeAll). */
export function scopeListSourceToUser(
  source: ListSource,
  userScopes: UserScopesForCapex,
  options?: { ready?: boolean },
): ListSource {
  if (options?.ready === false || userScopes.all) return source;
  const scoped = buildScopedListFromListSource(source, userScopes);
  const assetLastTaskMap: Record<string, string> = {};
  scoped.scopedLastTaskMap.forEach((v, k) => {
    assetLastTaskMap[k] = v;
  });
  const rowCount = scoped.scopedAssets.length;
  const totalAssetCount =
    typeof source.totalAssetCount === 'number' && rowCount >= source.totalAssetCount
      ? source.totalAssetCount
      : rowCount;
  return {
    ...source,
    assets: scoped.scopedAssets,
    projects: scoped.scopedProjects,
    assetLastTaskMap,
    totalAssetCount,
  };
}
