import type { User, UserAssignment, UserRole } from '../../types';
import { readCachedAuthUser } from '../authSessionCache';
import {
  findRoleForAssignment,
  isUserSuperAdmin,
  normalizeRoleNameKey,
} from '../userRoleResolution';

export type AuthMeAssignment = {
  roleName: string;
  assignedScopes?: string[];
};

/** Tampilkan slug enterprise sebagai label singkat (super_admin → Super Admin). */
export function humanizeRoleSlug(slug: string): string {
  const n = normalizeRoleNameKey(slug);
  if (n === 'superadmin' || n === 'superadministrator') return 'Super Admin';
  return String(slug ?? '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function mapMeAssignmentsToUserAssignments(
  assignments?: AuthMeAssignment[] | null,
  roleSlugs?: string[] | null,
): UserAssignment[] {
  if (assignments?.length) {
    return assignments
      .filter((a) => String(a.roleName ?? '').trim())
      .map((a) => ({
        roleName: String(a.roleName).trim(),
        assignedScopes: Array.isArray(a.assignedScopes) ? a.assignedScopes : [],
      }));
  }
  if (roleSlugs?.length) {
    return roleSlugs
      .filter((r) => String(r ?? '').trim())
      .map((slug) => ({
        roleName: humanizeRoleSlug(slug),
        assignedScopes: [] as string[],
      }));
  }
  return [];
}

function assignmentScopeCount(assignments: UserAssignment[]): number {
  return assignments.reduce((n, a) => n + (a.assignedScopes?.length ?? 0), 0);
}

/**
 * Bangun User dari identitas /auth/me tanpa menghapus assignments cache
 * (atau assignments dari response /me) — mencegah flicker "No Role".
 */
export function mergeAuthIdentityUser(
  identity: { id: number; username: string; email: string },
  options?: {
    meAssignments?: AuthMeAssignment[] | null;
    roleSlugs?: string[] | null;
    previous?: User | null;
  },
): User {
  const cached = readCachedAuthUser();
  const previous =
    options?.previous?.id === identity.id
      ? options.previous
      : cached?.id === identity.id
        ? cached
        : null;

  const fromMe = mapMeAssignmentsToUserAssignments(
    options?.meAssignments,
    options?.roleSlugs,
  );
  const previousAssignments = previous?.assignments ?? [];

  let assignments = fromMe;
  if (previousAssignments.length) {
    if (!fromMe.length) {
      assignments = previousAssignments;
    } else if (
      assignmentScopeCount(previousAssignments) > assignmentScopeCount(fromMe)
    ) {
      // Cache bootstrap biasanya punya scope lebih lengkap; jangan ditimpa stub kosong.
      assignments = previousAssignments;
    }
  }

  return {
    id: identity.id,
    username: identity.username,
    email: identity.email,
    phoneNumber: previous?.phoneNumber,
    assignments,
  };
}

/**
 * True jika sidebar / page guard boleh mengevaluasi akses (bukan loading).
 * Sebelum siap: tampilkan loading, bukan Access Denied / menu kosong sebagai deny.
 */
export function areShellPermissionsReady(
  currentUser: User | null,
  allRoles: UserRole[],
  options: { dataInitialized: boolean; bootstrapFailed?: boolean },
): boolean {
  if (!currentUser) return false;
  if (isUserSuperAdmin(currentUser, allRoles)) return true;

  const hasAssignments = (currentUser.assignments?.length ?? 0) > 0;
  const hasRoleMatrix = allRoles.length > 0;
  if (hasAssignments && hasRoleMatrix) {
    const anyMapped = currentUser.assignments.some((a) =>
      findRoleForAssignment(a, allRoles),
    );
    if (anyMapped) return true;
  }

  if (options.bootstrapFailed || options.dataInitialized) return true;
  return false;
}
