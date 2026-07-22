import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthContextService } from './auth-context.service';
import { isSuperAdminRole, type EnterpriseRoleSlug } from './auth.constants';
import type { ResolvedAuthContext } from './auth.types';
import {
  createSupabaseClient,
  getSupabaseServiceKey,
} from '../shared/supabase-client.factory';

export type HierarchyPermissionLevel = 'view' | 'update' | 'create' | 'delete';

const LEVEL_TO_DB_PERMISSION: Record<HierarchyPermissionLevel, string> = {
  view: 'View Only',
  update: 'View & Update',
  create: 'View, Update & Create',
  delete: 'View, Update, Create & Delete',
};

const DB_PERMISSION_TO_RANK: Record<string, number> = {
  Hide: 0,
  'View Only': 1,
  'View & Update': 2,
  'View, Update & Create': 3,
  'View, Update, Create & Delete': 4,
};

/**
 * Server-side authorization after authentication.
 * Never trust client-only permission UI for sensitive mutations.
 */
@Injectable()
export class AuthZService {
  constructor(private readonly authContext: AuthContextService) {}

  async resolve(
    accessToken: string,
    requestedUserId?: number,
  ): Promise<ResolvedAuthContext> {
    return this.authContext.resolve(accessToken, requestedUserId);
  }

  async assertAnyRole(
    accessToken: string,
    requestedUserId: number,
    allowed: EnterpriseRoleSlug[],
  ): Promise<ResolvedAuthContext> {
    const ctx = await this.resolve(accessToken, requestedUserId);
    this.assertRolesOnContext(ctx, allowed);
    return ctx;
  }

  assertRolesOnContext(
    ctx: ResolvedAuthContext,
    allowed: EnterpriseRoleSlug[],
  ): void {
    if (ctx.roles.some((r) => isSuperAdminRole(r))) return;
    if (allowed.some((r) => ctx.roles.includes(r))) return;
    throw new ForbiddenException('Insufficient role for this operation');
  }

  /** Configuration CRUD: super admin / PMO, or matrix permission on config hierarchies. */
  async assertConfigurationAccess(
    accessToken: string,
    requestedUserId: number,
  ): Promise<ResolvedAuthContext> {
    const ctx = await this.resolve(accessToken, requestedUserId);
    if (ctx.roles.some((r) => isSuperAdminRole(r))) return ctx;
    if (ctx.roles.includes('super_admin') || ctx.roles.includes('pmo')) return ctx;

    const serviceKey = getSupabaseServiceKey();
    const db = serviceKey ? createSupabaseClient(serviceKey) : ctx.client;
    const hierarchies = ['Configuration', 'Role Management', 'User Management'];
    for (const hierarchy of hierarchies) {
      const { data, error } = await db.rpc('user_has_permission_for_hierarchy', {
        p_user_id: ctx.userId,
        p_hierarchy: hierarchy,
        p_required_permission: 'View & Update',
      });
      if (!error && data === true) return ctx;
    }

    throw new ForbiddenException(
      'Insufficient permission for configuration management (requires Super Admin, PMO, or Configuration/Role Management access)',
    );
  }

  /** Matrix permission on a hierarchy level (role_permissions table). */
  async assertHierarchyPermission(
    accessToken: string,
    requestedUserId: number,
    hierarchy: string,
    level: HierarchyPermissionLevel,
  ): Promise<ResolvedAuthContext> {
    const ctx = await this.resolve(accessToken, requestedUserId);
    if (ctx.roles.some((r) => isSuperAdminRole(r))) return ctx;

    const serviceKey = getSupabaseServiceKey();
    const db = serviceKey ? createSupabaseClient(serviceKey) : ctx.client;
    const requiredPermission = LEVEL_TO_DB_PERMISSION[level];
    const { data, error } = await db.rpc('user_has_permission_for_hierarchy', {
      p_user_id: ctx.userId,
      p_hierarchy: hierarchy,
      p_required_permission: requiredPermission,
    });
    if (!error && data === true) return ctx;

    throw new ForbiddenException(
      `Insufficient permission for ${hierarchy} (requires ${requiredPermission} or higher)`,
    );
  }
}
