import type { User, UserAssignment, UserRole } from '../types';

/** Normalisasi nama role agar assignment user cocok dengan master role. */
export function normalizeRoleNameKey(name: string | null | undefined): string {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export type UserAssignmentWithRoleId = UserAssignment & { roleId?: number };

export function findRoleForAssignment(
  assignment: UserAssignmentWithRoleId,
  allRoles: UserRole[],
): UserRole | undefined {
  if (assignment.roleId != null && Number.isFinite(assignment.roleId)) {
    const byId = allRoles.find((r) => r.id === assignment.roleId);
    if (byId) return byId;
  }
  const key = normalizeRoleNameKey(assignment.roleName);
  if (!key) return undefined;
  return allRoles.find((r) => normalizeRoleNameKey(r.roleName) === key);
}

export function isUserSuperAdmin(user: User | null, allRoles: UserRole[]): boolean {
  if (!user) return false;
  return user.assignments.some((assignment) => {
    const a = assignment as UserAssignmentWithRoleId;
    if (normalizeRoleNameKey(a.roleName) === 'superadmin') return true;
    const role = findRoleForAssignment(a, allRoles);
    return role != null && normalizeRoleNameKey(role.roleName) === 'superadmin';
  });
}

/** Lengkapi roleName dari master role (penting setelah simpan user dari backend). */
export function enrichUserAssignments(user: User, allRoles: UserRole[]): User {
  if (!allRoles.length) return user;
  return {
    ...user,
    assignments: user.assignments.map((assignment) => {
      const role = findRoleForAssignment(assignment as UserAssignmentWithRoleId, allRoles);
      return {
        ...assignment,
        roleName: role?.roleName ?? assignment.roleName,
      };
    }),
  };
}

export function getPrimaryRoleDisplayName(
  user: User | null,
  allRoles: UserRole[],
  fallbackRoleSlugs?: string[] | null,
): string {
  if (user?.assignments?.length) {
    const first = user.assignments[0] as UserAssignmentWithRoleId;
    const role = findRoleForAssignment(first, allRoles);
    return role?.roleName ?? first.roleName ?? 'No Role';
  }
  const slug = fallbackRoleSlugs?.find((r) => String(r ?? '').trim());
  if (slug) {
    const n = normalizeRoleNameKey(slug);
    if (n === 'superadmin' || n === 'superadministrator') return 'Super Admin';
    return String(slug)
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return 'No Role';
}
