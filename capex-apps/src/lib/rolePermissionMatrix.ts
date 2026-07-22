import type { User, UserRole, HierarchyLevel, PermissionLevel, Page } from '../types';
import { HIERARCHY_LEVELS, PAGE_TO_HIERARCHY_MAP, PERMISSION_LEVELS } from '../types';
import {
  findRoleForAssignment,
  isUserSuperAdmin,
  normalizeRoleNameKey,
} from './userRoleResolution';

export { normalizeRoleNameKey, isUserSuperAdmin, findRoleForAssignment } from './userRoleResolution';

/** Sama dengan nilai di `usePermissions` — dipakai konsisten untuk routing landing. */
export const permissionValues: Record<PermissionLevel, number> = {
  Hide: 0,
  'View Only': 1,
  'View & Update': 2,
  'View, Update & Create': 3,
  'View, Update, Create & Delete': 4,
};

/**
 * Map hierarchy → nilai permission numerik (maksimum dari semua role user).
 * Tanpa user atau sebelum role master dimuat: sembunyikan akses (hindari flash semua menu di sidebar).
 */
export function buildConsolidatedPermissionMap(
  currentUser: User | null,
  allRoles: UserRole[],
): Map<HierarchyLevel, number> {
  const consolidated = new Map<HierarchyLevel, number>();
  const maxPermission = permissionValues['View, Update, Create & Delete'];
  const hidePermission = permissionValues.Hide;

  if (!currentUser) {
    HIERARCHY_LEVELS.forEach((level) => consolidated.set(level, hidePermission));
    return consolidated;
  }

  // Super Admin dari assignment.roleName tetap valid sebelum master roles dimuat.
  if (isUserSuperAdmin(currentUser, allRoles)) {
    HIERARCHY_LEVELS.forEach((level) => consolidated.set(level, maxPermission));
    return consolidated;
  }

  if (!allRoles.length) {
    HIERARCHY_LEVELS.forEach((level) => consolidated.set(level, hidePermission));
    return consolidated;
  }

  currentUser.assignments.forEach((assignment) => {
    const role = findRoleForAssignment(assignment, allRoles);
    if (role) {
      role.permissions.forEach((perm) => {
        const level = perm.hierarchy as HierarchyLevel;
        const newPermissionValue = permissionValues[perm.permission];
        const currentPermissionValue = consolidated.get(level) || 0;
        if (newPermissionValue > currentPermissionValue) {
          consolidated.set(level, newPermissionValue);
        }
      });
    }
  });

  return consolidated;
}

export function canAccessPageWithPermissionMap(
  userPermissions: Map<HierarchyLevel, number>,
  page: Page,
): boolean {
  const hierarchyLevel = PAGE_TO_HIERARCHY_MAP[page];
  if (!hierarchyLevel) return true;
  const userPermissionValue = userPermissions.get(hierarchyLevel) || 0;
  return userPermissionValue >= permissionValues['View Only'];
}

export function getPermissionLevelForHierarchy(
  userPermissions: Map<HierarchyLevel, number>,
  level: HierarchyLevel,
): PermissionLevel {
  const value = userPermissions.get(level) || 0;
  return PERMISSION_LEVELS[value] || 'Hide';
}
