import type { SupabaseClient } from '@supabase/supabase-js';
import { roleNameToSlug, type EnterpriseRoleSlug } from './auth.constants';

/** Load live role slugs from DB — never trust JWT payload for AuthZ decisions. */
export async function loadRoleSlugsForUser(
  client: SupabaseClient,
  userId: number,
): Promise<EnterpriseRoleSlug[]> {
  const { data } = await client
    .from('user_assignments')
    .select('roles(role_name)')
    .eq('user_id', userId);

  const slugs = new Set<EnterpriseRoleSlug>();
  for (const row of data ?? []) {
    const roles = (row as { roles?: { role_name?: string; name?: string } | { role_name?: string; name?: string }[] })
      .roles;
    const roleObj = Array.isArray(roles) ? roles[0] : roles;
    const roleName = roleObj?.role_name ?? roleObj?.name;
    if (!roleName) continue;
    slugs.add(roleNameToSlug(String(roleName)));
  }
  return [...slugs];
}
