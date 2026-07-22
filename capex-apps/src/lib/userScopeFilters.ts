import type { ArchetypeConfig, HospitalUnitConfig } from '../types';

/** Set scope dari assignments user (All / nama archetype / nama HU). */
export type UserScopeSets = {
  all: boolean;
  archetypes: Set<string>;
  hus: Set<string>;
};

/** Cocokkan nama ke Set scope (trim + case-insensitive) — menyelaraskan data budget vs assignment. */
export function scopeSetHasInsensitive(set: Set<string>, value: string | undefined | null): boolean {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return false;
  for (const x of set) {
    if ((x ?? '').trim().toLowerCase() === v) return true;
  }
  return false;
}

/** Ambil string canonical dari set jika ada kecocokan case-insensitive. */
export function resolveCanonicalFromNameSet(scope: string, nameSet: Set<string>): string | null {
  const t = scope.trim().toLowerCase();
  if (!t) return null;
  for (const n of nameSet) {
    const c = (n ?? '').trim();
    if (c.toLowerCase() === t) return c;
  }
  return null;
}

/**
 * Cocokkan scope singkat ke nama di master (mis. assignment "Semarang" vs HU "Semarang Srondol").
 * Prioritas: nama HU/archetype terpendek yang mengandung scope (≥ 4 char).
 */
export function resolvePartialNameMatch(scope: string, nameSet: Set<string>): string | null {
  const s = scope.trim().toLowerCase();
  if (s.length < 4) return null;
  let best: string | null = null;
  let bestLen = Infinity;
  for (const n of nameSet) {
    const c = (n ?? '').trim();
    const cl = c.toLowerCase();
    if (cl === s) return c;
    if (cl.includes(s)) {
      if (c.length < bestLen) {
        best = c;
        bestLen = c.length;
      }
    } else if (s.includes(cl) && cl.length >= 4) {
      if (c.length < bestLen) {
        best = c;
        bestLen = c.length;
      }
    }
  }
  return best;
}

/** Satu baris data (proyek/asset) terlihat jika scope All, archetype cocok, atau HU cocok. */
export function isInUserScope(
  scopes: UserScopeSets,
  huName: string,
  archetypeName: string
): boolean {
  const hu = (huName || '').trim();
  const arch = (archetypeName || '').trim();
  if (scopes.all) return true;
  if (scopeSetHasInsensitive(scopes.archetypes, arch)) return true;
  if (scopeSetHasInsensitive(scopes.hus, hu)) return true;
  return false;
}

/**
 * Archetype yang boleh muncul di slicer/filter — sesuai scope (nama archetype atau minimal satu HU di archetype itu).
 */
export function filterArchetypesByScope(
  archetypes: ArchetypeConfig[],
  allHus: HospitalUnitConfig[],
  scopes: UserScopeSets
): ArchetypeConfig[] {
  if (scopes.all) return archetypes;
  return archetypes.filter(arch => {
    const an = (arch.name || '').trim();
    if (scopeSetHasInsensitive(scopes.archetypes, an)) return true;
    return allHus.some(
      hu =>
        hu.archetypeId === arch.id && scopeSetHasInsensitive(scopes.hus, (hu.name || '').trim())
    );
  });
}

/**
 * Filter master HU sesuai Role+Scope + optional archetype dari filter bar.
 * Selaras dengan Budget HU: All → semua (dalam archetype terpilih); archetype scope → semua HU di archetype itu; selain itu → hanya HU yang namanya di scope.
 */
export function filterHospitalUnitsByScope(
  hus: HospitalUnitConfig[],
  archetypeConfigs: ArchetypeConfig[],
  scopes: UserScopeSets,
  selectedArchetypeName: string | null
): HospitalUnitConfig[] {
  const selectedArch = selectedArchetypeName != null ? selectedArchetypeName.trim() : '';
  const selectedArchetypeKey = selectedArch || null;

  let filtered = hus;
  if (selectedArchetypeKey) {
    const arch = archetypeConfigs.find(a => (a.name || '').trim() === selectedArchetypeKey);
    if (arch) filtered = filtered.filter(hu => hu.archetypeId === arch.id);
  }
  if (scopes.all) return filtered;

  if (selectedArchetypeKey) {
    const arch = archetypeConfigs.find(a => (a.name || '').trim() === selectedArchetypeKey);
    if (arch && scopeSetHasInsensitive(scopes.archetypes, (arch.name || '').trim())) {
      return filtered;
    }
    return filtered.filter(hu => scopeSetHasInsensitive(scopes.hus, (hu.name || '').trim()));
  }

  return filtered.filter(hu => {
    const huN = (hu.name || '').trim();
    if (scopeSetHasInsensitive(scopes.hus, huN)) return true;
    const arch = archetypeConfigs.find(a => a.id === hu.archetypeId);
    return !!(arch && scopeSetHasInsensitive(scopes.archetypes, (arch.name || '').trim()));
  });
}
