import type { ProjectPriorityConfig, User } from '../types';

/** Roles that may view/edit project priority in forms and quick actions (names compared with trim). */
export const PROJECT_PRIORITY_EDIT_ROLE_NAMES = ['Super Admin', 'PMO'] as const;

function normalizeRoleName(name: string | null | undefined): string {
    return (name ?? '').trim();
}

export function userCanEditProjectPriority(user: User | null | undefined): boolean {
    if (!user?.assignments?.length) return false;
    const allowed = new Set<string>(
        PROJECT_PRIORITY_EDIT_ROLE_NAMES.map((n) => n.trim()),
    );
    return user.assignments.some((a) => allowed.has(normalizeRoleName(a.roleName)));
}

/** Default priority for newly created projects: active priority named "Regular" (case-insensitive), else first active. */
export function resolveDefaultRegularPriorityId(priorities: ProjectPriorityConfig[]): string {
    const active = priorities.filter((p) => p.isActive);
    const regular = active.find((p) => p.name.trim().toLowerCase() === 'regular');
    return regular?.id ?? active[0]?.id ?? '';
}
