import { HIERARCHY_LEVELS, type PermissionLevel, type UserRole } from '@/types';

export function normalizeRolesWithAllLevels(source: UserRole[]): UserRole[] {
  return source.map((role) => {
    const existingLevels = new Set(role.permissions.map((p) => p.hierarchy));
    const missingLevels = HIERARCHY_LEVELS.filter((level) => !existingLevels.has(level));
    const additionalPermissions = missingLevels.map((level) => ({
      hierarchy: level,
      permission: 'Hide' as PermissionLevel,
    }));
    return {
      ...role,
      permissions: [...role.permissions, ...additionalPermissions],
    };
  });
}
