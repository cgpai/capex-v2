import type {
  EnrichedAsset,
  HospitalUnitConfig,
  Project,
  ProjectPriorityConfig,
} from '../../types';

export const normalizeBdd = (value: unknown): string => String(value ?? '').trim().toLowerCase();

export type BddRoleFlags = {
  isSuperAdmin: boolean;
  hasBDDRole: boolean;
};

export type BddUserScopes = {
  all: boolean;
  hus: Set<string>;
  huIds: Set<string>;
  archetypes: Set<string>;
  archetypeIds: Set<string>;
};

export type BddFilterMaps = {
  projectById: Map<string, Project>;
  huLabelByName: Map<string, string>;
  projectPriorityMap: Map<string, string>;
};

export function isBddConstructionAsset(asset: {
  assetTypeGroupName?: string | null;
  assetName?: string | null;
  projectName?: string | null;
}): boolean {
  const group = normalizeBdd(asset.assetTypeGroupName);
  const assetName = normalizeBdd(asset.assetName);
  const projectName = normalizeBdd(asset.projectName);
  return (
    group === 'infrastructure' ||
    group === 'construction' ||
    assetName.includes('construction') ||
    assetName.includes('infrastructure') ||
    assetName.includes('infrastruktur') ||
    assetName.includes('renovasi') ||
    projectName.includes('construction') ||
    projectName.includes('infrastructure') ||
    projectName.includes('infrastruktur') ||
    projectName.includes('renovasi')
  );
}

export function buildBddFilterMaps(
  allProjects: Project[],
  priorities: ProjectPriorityConfig[],
  hus: HospitalUnitConfig[],
): BddFilterMaps {
  const projectById = new Map<string, Project>(allProjects.map((p) => [String(p.id), p]));
  const huLabelByName = new Map(
    hus.map((hu) => {
      const code = String(hu?.code || '').trim();
      const name = String(hu?.name || '').trim();
      return [normalizeBdd(name), code ? `${code} - ${name}` : name] as [string, string];
    }),
  );
  const priorityIdToName = new Map(priorities.map((p) => [p.id, p.name] as [string, string]));
  const projectPriorityMap = new Map<string, string>();
  for (const p of allProjects) {
    const priorityName = priorityIdToName.get(p.priorityId);
    if (priorityName) projectPriorityMap.set(p.id, priorityName);
  }
  return { projectById, huLabelByName, projectPriorityMap };
}

export type BddConstructionFilters = {
  searchLower: string;
  selectedHUs: string[];
  selectedPriorities: string[];
  completionRange: { min: number; max: number };
  meetingFilters: { archetype: string | null; assetTypeGroup: string | null };
  periodName?: string;
};

export function filterBddConstructionAssets(
  allAssets: EnrichedAsset[],
  maps: BddFilterMaps,
  filters: BddConstructionFilters,
  roleFlags: BddRoleFlags,
  userScopes: BddUserScopes,
): EnrichedAsset[] {
  const { searchLower, selectedHUs, selectedPriorities, completionRange, meetingFilters, periodName } =
    filters;
  const { isSuperAdmin, hasBDDRole } = roleFlags;
  const { projectById, huLabelByName, projectPriorityMap } = maps;

  return allAssets.filter((asset) => {
    if (!isBddConstructionAsset(asset)) return false;

    if (!userScopes.all) {
      const inHuScope =
        userScopes.hus.has(asset.huName) ||
        userScopes.huIds.has(String((asset as EnrichedAsset & { huId?: string }).huId || ''));
      const inArchetypeScope =
        userScopes.archetypes.has(asset.archetypeName) ||
        userScopes.archetypeIds.has(String((asset as EnrichedAsset & { archetypeId?: string }).archetypeId || ''));
      if (!inHuScope && !inArchetypeScope) return false;
    }

    if (!isSuperAdmin && !hasBDDRole) {
      if (!asset.bddPriority || asset.bddPriority === 'unassigned' || asset.bddPriority === '') {
        return false;
      }
    }

    if (meetingFilters.archetype && normalizeBdd(asset.archetypeName) !== normalizeBdd(meetingFilters.archetype)) {
      return false;
    }

    if (
      meetingFilters.assetTypeGroup &&
      normalizeBdd(asset.assetTypeGroupName) !== normalizeBdd(meetingFilters.assetTypeGroup)
    ) {
      return false;
    }

    if (selectedHUs.length > 0) {
      const assetHuLabel = huLabelByName.get(normalizeBdd(asset.huName)) || asset.huName;
      const selectedMatch = selectedHUs.some(
        (hu) => normalizeBdd(hu) === normalizeBdd(assetHuLabel) || normalizeBdd(hu) === normalizeBdd(asset.huName),
      );
      if (!selectedMatch) return false;
    }

    if (periodName) {
      const project = projectById.get(String(asset.projectId)) as (Project & { periodName?: string }) | undefined;
      if (normalizeBdd(project?.periodName) !== normalizeBdd(periodName)) return false;
    }

    if (selectedPriorities.length > 0) {
      const priorityName = projectPriorityMap.get(asset.projectId);
      if (!priorityName || !selectedPriorities.some((p) => normalizeBdd(p) === normalizeBdd(priorityName))) {
        return false;
      }
    }

    const rate = asset.completionRate || 0;
    if (rate < completionRange.min || rate > completionRange.max) return false;

    if (
      searchLower &&
      !(
        normalizeBdd(asset.assetName).includes(searchLower) ||
        normalizeBdd(asset.projectName).includes(searchLower) ||
        normalizeBdd(asset.huName).includes(searchLower) ||
        normalizeBdd(asset.projectCode).includes(searchLower)
      )
    ) {
      return false;
    }

    return true;
  });
}

export function buildHuFilterOptions(hus: HospitalUnitConfig[]): string[] {
  const uniq = new Set<string>();
  for (const hu of hus) {
    const code = String(hu?.code || '').trim();
    const name = String(hu?.name || '').trim();
    if (!name) continue;
    uniq.add(code ? `${code} - ${name}` : name);
  }
  return Array.from(uniq).sort((a, b) => a.localeCompare(b));
}
