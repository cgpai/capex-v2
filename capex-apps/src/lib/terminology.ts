import type { HierarchyLevel } from '../types';

/** User-facing label for organizational grouping (internal keys may still use "archetype"). */
export const NETWORK_LABEL = 'Network';
export const BUDGET_NETWORK_LABEL = 'Budget Network';

/** Map permission hierarchy keys (stored in DB) to display labels. */
export function formatHierarchyDisplayLabel(level: HierarchyLevel | string): string {
  switch (level) {
    case 'Archetype':
      return NETWORK_LABEL;
    case 'Budget Archetype':
      return BUDGET_NETWORK_LABEL;
    default:
      return level;
  }
}

/** Legacy Excel / import column headers after terminology rename. */
export const LEGACY_NETWORK_HEADER_TO_FIELD_KEY: Record<string, Record<string, string>> = {
  Archetypes: {
    archetypename: 'name',
    networkname: 'name',
    archetypecode: 'code',
    networkcode: 'code',
  },
  BudgetArchetype: {
    archetypename: 'archetypeName',
    networkname: 'archetypeName',
  },
  HospitalUnits: {
    archetypecode: 'archetypeCode',
    networkcode: 'archetypeCode',
  },
};
