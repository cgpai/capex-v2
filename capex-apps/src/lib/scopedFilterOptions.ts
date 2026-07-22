import type { ArchetypeConfig, HospitalUnitConfig } from '@/types';

export type UserScopesShape = {
  all: boolean;
  archetypes: Set<string>;
  hus: Set<string>;
  archetypeIds: Set<string>;
  huIds: Set<string>;
};

export function buildScopedArchetypeOptions(
  archetypes: ArchetypeConfig[],
  userScopes: UserScopesShape,
  hus: HospitalUnitConfig[] = [],
): string[] {
  if (userScopes.all) {
    return archetypes.map((a) => a.name).sort((a, b) => a.localeCompare(b));
  }

  const relevantNames = new Set(userScopes.archetypes);
  const relevantIds = new Set(userScopes.archetypeIds);

  for (const h of hus) {
    if (userScopes.hus.has(h.name) || userScopes.huIds.has(h.id)) {
      const arch = archetypes.find((a) => a.id === h.archetypeId);
      if (arch) {
        relevantNames.add(arch.name);
        relevantIds.add(arch.id);
      }
    }
  }

  return archetypes
    .filter((a) => relevantNames.has(a.name) || relevantIds.has(a.id))
    .map((a) => a.name)
    .sort((a, b) => a.localeCompare(b));
}

export type ScopeNamedRow = {
  huName: string;
  archetypeName: string;
};

type ScopeMasterConfig = {
  archetypes?: Array<{ id: string; name: string }>;
  hus?: Array<{ id: string; name: string }>;
};

/** Base row filter — same semantics as Capex Project List / My Tasks. */
export function filterRowsByUserScope<T extends ScopeNamedRow>(
  rows: T[],
  userScopes: UserScopesShape,
  master?: ScopeMasterConfig,
): T[] {
  if (userScopes.all) return rows;

  const hasAnyScope =
    userScopes.archetypes.size > 0 ||
    userScopes.hus.size > 0 ||
    userScopes.archetypeIds.size > 0 ||
    userScopes.huIds.size > 0;
  if (!hasAnyScope) return [];

  const archetypeIdToName = new Map(
    (master?.archetypes ?? []).map((a) => [a.id, a.name] as const),
  );
  const huIdToName = new Map((master?.hus ?? []).map((h) => [h.id, h.name] as const));

  const effectiveScopedArchetypeNames = new Set<string>([...userScopes.archetypes]);
  for (const id of userScopes.archetypeIds) {
    const name = archetypeIdToName.get(id);
    if (name) effectiveScopedArchetypeNames.add(name);
  }

  const effectiveScopedHuNames = new Set<string>([...userScopes.hus]);
  for (const id of userScopes.huIds) {
    const name = huIdToName.get(id);
    if (name) effectiveScopedHuNames.add(name);
  }

  return rows.filter(
    (row) =>
      effectiveScopedArchetypeNames.has(row.archetypeName) ||
      effectiveScopedHuNames.has(row.huName),
  );
}

export function buildScopedHuOptions(
  hus: HospitalUnitConfig[],
  archetypes: ArchetypeConfig[],
  userScopes: UserScopesShape,
): string[] {
  if (userScopes.all) {
    return hus.map((h) => h.name).sort((a, b) => a.localeCompare(b));
  }
  const visibleArchIds = new Set(
    archetypes
      .filter((a) => userScopes.archetypes.has(a.name) || userScopes.archetypeIds.has(a.id))
      .map((a) => a.id),
  );
  const names = new Set<string>();
  for (const h of hus) {
    if (visibleArchIds.has(h.archetypeId)) names.add(h.name);
    if (userScopes.hus.has(h.name) || userScopes.huIds.has(h.id)) names.add(h.name);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}
