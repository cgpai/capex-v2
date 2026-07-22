import { isUserSuperAdmin, normalizeRoleNameKey } from './userRoleResolution';
import type { User, UserRole } from '../types';

export type UserAssignmentLike = {
  roleName?: string;
  assignedScopes?: string[];
};

export type AssetScopeLike = {
  huName?: string;
  archetypeName?: string;
};

export type ScopeResolutionMaps = {
  archetypeIdToName: Map<string, string>;
  huIdToName: Map<string, string>;
  huIdToArchetypeName: Map<string, string>;
  huNameToArchetypeName: Map<string, string>;
  archetypeNameSet: Set<string>;
  huNameSet: Set<string>;
};

const norm = (id: string | number | undefined) => (id == null ? '' : String(id));

function assignmentHasAllScope(scopes: string[] | undefined): boolean {
  return (scopes ?? []).some((s) => String(s).trim().toLowerCase() === 'all');
}

export function buildScopeResolutionMaps(
  archetypes: { id: string; name: string }[],
  hospitalUnits: { id: string; name: string; archetypeId: string }[],
): ScopeResolutionMaps {
  const archetypeIdToName = new Map<string, string>();
  const archetypeNameSet = new Set<string>();
  for (const arch of archetypes) {
    if (arch.id) archetypeIdToName.set(arch.id, arch.name);
    if (arch.name) archetypeNameSet.add(arch.name);
  }

  const huIdToName = new Map<string, string>();
  const huIdToArchetypeName = new Map<string, string>();
  const huNameToArchetypeName = new Map<string, string>();
  const huNameSet = new Set<string>();
  for (const hu of hospitalUnits) {
    if (hu.id) huIdToName.set(hu.id, hu.name);
    if (hu.name) huNameSet.add(hu.name);
    const archName = archetypeIdToName.get(hu.archetypeId) ?? '';
    if (hu.id && archName) huIdToArchetypeName.set(hu.id, archName);
    if (hu.name && archName) huNameToArchetypeName.set(hu.name, archName);
  }

  return {
    archetypeIdToName,
    huIdToName,
    huIdToArchetypeName,
    huNameToArchetypeName,
    archetypeNameSet,
    huNameSet,
  };
}

function resolveAssignmentScopes(
  assignments: UserAssignmentLike[] | undefined,
  maps: ScopeResolutionMaps,
): { unitNames: Set<string>; archetypeNames: Set<string> } {
  const unitNames = new Set<string>();
  const archetypeNames = new Set<string>();

  const addArchetype = (name: string) => {
    if (name) archetypeNames.add(name);
  };
  const addUnit = (name: string) => {
    if (!name) return;
    unitNames.add(name);
    const arch = maps.huNameToArchetypeName.get(name);
    if (arch) addArchetype(arch);
  };

  for (const assign of assignments ?? []) {
    for (const raw of assign.assignedScopes ?? []) {
      const token = String(raw ?? '').trim();
      if (!token || token.toLowerCase() === 'all') {
        maps.archetypeNameSet.forEach((n) => addArchetype(n));
        maps.huNameSet.forEach((n) => addUnit(n));
        continue;
      }
      if (maps.archetypeNameSet.has(token)) {
        addArchetype(token);
        continue;
      }
      if (maps.huNameSet.has(token)) {
        addUnit(token);
        continue;
      }
      if (token.startsWith('ARCH-')) {
        addArchetype(maps.archetypeIdToName.get(token) ?? token);
        continue;
      }
      if (token.startsWith('HU-')) {
        const huName = maps.huIdToName.get(token) ?? token;
        addUnit(huName);
        continue;
      }
      const archById = maps.archetypeIdToName.get(token);
      if (archById) {
        addArchetype(archById);
        continue;
      }
      const huById = maps.huIdToName.get(token);
      if (huById) addUnit(huById);
    }
  }

  return { unitNames, archetypeNames };
}

export function userHasGlobalTaskScope(user: User | null, allRoles: UserRole[]): boolean {
  if (!user) return false;
  if (isUserSuperAdmin(user, allRoles)) return true;
  return (user.assignments ?? []).some((a) => assignmentHasAllScope(a.assignedScopes));
}

export function isAssetInUserUnionScope(
  asset: AssetScopeLike,
  assignments: UserAssignmentLike[] | undefined,
  maps: ScopeResolutionMaps,
  options?: { globalScope?: boolean },
): boolean {
  if (options?.globalScope) return true;

  const union = resolveAssignmentScopes(assignments, maps);
  if (!asset.huName && !asset.archetypeName) return false;
  return (
    (asset.huName != null && union.unitNames.has(asset.huName)) ||
    (asset.archetypeName != null && union.archetypeNames.has(asset.archetypeName))
  );
}

export function isWorkflowStepAssignedToUser(
  stepRoleIds: Array<string | number>,
  assignments: UserAssignmentLike[] | undefined,
  allRoles: UserRole[],
  asset: AssetScopeLike,
  maps: ScopeResolutionMaps,
): boolean {
  const stepRoleSet = new Set(stepRoleIds.map(norm));

  for (const assignment of assignments ?? []) {
    const role = allRoles.find((r) => r.roleName === assignment.roleName);
    if (!role || !stepRoleSet.has(norm(role.id))) continue;

    if (normalizeRoleNameKey(assignment.roleName) === 'superadmin') return true;
    if (assignmentHasAllScope(assignment.assignedScopes)) return true;

    const resolved = resolveAssignmentScopes([assignment], maps);
    const inUnit = asset.huName != null && resolved.unitNames.has(asset.huName);
    const inArch = asset.archetypeName != null && resolved.archetypeNames.has(asset.archetypeName);
    if (inUnit || inArch) return true;
  }

  return false;
}
