export type ResolvedUserScope = {
  unitNames: Set<string>;
  archetypeNames: Set<string>;
};

export type ScopeResolutionMaps = {
  archetypeIdToName: Map<string, string>;
  huIdToName: Map<string, string>;
  huIdToArchetypeName: Map<string, string>;
  huNameToArchetypeName: Map<string, string>;
  archetypeNameSet: Set<string>;
  huNameSet: Set<string>;
  allArchetypeNames: string[];
  allHuNames: string[];
};

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
    allArchetypeNames: archetypes.map((a) => a.name).filter(Boolean),
    allHuNames: hospitalUnits.map((hu) => hu.name).filter(Boolean),
  };
}

function addArchetype(target: ResolvedUserScope, name: string): void {
  if (name) target.archetypeNames.add(name);
}

function addUnit(target: ResolvedUserScope, name: string, maps: ScopeResolutionMaps): void {
  if (!name) return;
  target.unitNames.add(name);
  const arch = maps.huNameToArchetypeName.get(name);
  if (arch) addArchetype(target, arch);
}

export function applyScopeToken(
  raw: string,
  maps: ScopeResolutionMaps,
  target: ResolvedUserScope,
): void {
  const token = String(raw ?? '').trim();
  if (!token || token.toLowerCase() === 'all') {
    maps.allArchetypeNames.forEach((n) => addArchetype(target, n));
    maps.allHuNames.forEach((n) => addUnit(target, n, maps));
    return;
  }

  if (maps.archetypeNameSet.has(token)) {
    addArchetype(target, token);
    return;
  }
  if (maps.huNameSet.has(token)) {
    addUnit(target, token, maps);
    return;
  }

  if (token.startsWith('ARCH-')) {
    addArchetype(target, maps.archetypeIdToName.get(token) ?? token);
    return;
  }
  if (token.startsWith('HU-')) {
    const huName = maps.huIdToName.get(token) ?? token;
    addUnit(target, huName, maps);
    return;
  }

  const archById = maps.archetypeIdToName.get(token);
  if (archById) {
    addArchetype(target, archById);
    return;
  }

  const huById = maps.huIdToName.get(token);
  if (huById) {
    addUnit(target, huById, maps);
    const arch = maps.huIdToArchetypeName.get(token);
    if (arch) addArchetype(target, arch);
  }
}

export function resolveUserScopes(
  assignments: Array<{ roleName?: string; assignedScopes?: string[] }> | undefined,
  maps: ScopeResolutionMaps,
): ResolvedUserScope {
  const target: ResolvedUserScope = { unitNames: new Set(), archetypeNames: new Set() };
  for (const assign of assignments ?? []) {
    for (const scope of assign.assignedScopes ?? []) {
      applyScopeToken(scope, maps, target);
    }
  }
  return target;
}

export function formatRoleNames(
  assignments: Array<{ roleName?: string }> | undefined,
): string {
  const names = [...new Set((assignments ?? []).map((a) => String(a.roleName ?? '').trim()).filter(Boolean))];
  return names.length > 0 ? names.join(', ') : 'N/A';
}
