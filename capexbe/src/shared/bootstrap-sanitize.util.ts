/** Role permission matrix only for roles assigned to the viewer (prod data minimization). */
export function sanitizeRolesForViewer(
  roles: Array<{ id?: number; roleName?: string; permissions?: unknown[] }>,
  assignments: Array<{ roleName?: string }> | undefined,
): typeof roles {
  const assigned = new Set(
    (assignments ?? []).map((a) => String(a.roleName ?? '').trim()).filter(Boolean),
  );
  return roles.map((role) => {
    const roleName = String(role.roleName ?? '').trim();
    if (assigned.has(roleName)) return role;
    return {
      id: role.id,
      roleName: role.roleName,
      permissions: [],
    };
  });
}
