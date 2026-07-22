import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY, type RequiredPermission } from '../decorators/permissions.decorator';
import { isSuperAdminRole } from '../auth.constants';
import type { ResolvedAuthContext } from '../auth.types';

const LEVEL_RANK: Record<RequiredPermission['level'], number> = {
  view: 1,
  update: 2,
  create: 3,
  delete: 4,
};

const LEVEL_TO_DB_PERMISSION: Record<RequiredPermission['level'], string> = {
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

/** Super admin bypasses permission checks. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  private async getUserHierarchyPermissionRank(
    ctx: ResolvedAuthContext,
    hierarchy: string,
  ): Promise<number> {
    const { data, error } = await ctx.client
      .from('user_assignments')
      .select('roles!inner(role_permissions(permission,hierarchy))')
      .eq('user_id', ctx.userId);
    if (error) {
      throw new ForbiddenException('Failed to resolve user permissions');
    }

    let maxRank = 0;
    for (const row of data ?? []) {
      const roleRef = (row as { roles?: unknown }).roles;
      const roleRows = Array.isArray(roleRef) ? roleRef : [roleRef];
      for (const roleRow of roleRows) {
        const permissionsRef = (roleRow as { role_permissions?: unknown })?.role_permissions;
        const permissionRows = Array.isArray(permissionsRef) ? permissionsRef : [permissionsRef];
        for (const permissionRow of permissionRows) {
          const hierarchyName = String((permissionRow as { hierarchy?: string })?.hierarchy ?? '').trim();
          if (hierarchyName !== hierarchy) continue;
          const rank = DB_PERMISSION_TO_RANK[String((permissionRow as { permission?: string })?.permission ?? '')] ?? 0;
          if (rank > maxRank) maxRank = rank;
        }
      }
    }
    return maxRank;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermission>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const req = context.switchToHttp().getRequest<{ authContext?: ResolvedAuthContext }>();
    const ctx = req.authContext;
    if (!ctx) {
      throw new ForbiddenException('Authentication required');
    }
    if (ctx.roles.some((r) => isSuperAdminRole(r))) {
      return true;
    }

    if (ctx.client) {
      const requiredRank = DB_PERMISSION_TO_RANK[LEVEL_TO_DB_PERMISSION[required.level]] ?? LEVEL_RANK[required.level];
      const currentRank = await this.getUserHierarchyPermissionRank(ctx, required.hierarchy);
      if (currentRank < requiredRank) {
        throw new ForbiddenException('Insufficient permission');
      }
      return true;
    }

    const minRank = LEVEL_RANK[required.level];
    if (ctx.roles.includes('pmo') && minRank <= 3) {
      return true;
    }
    if (ctx.roles.includes('manager') && minRank <= 2) {
      return true;
    }
    if (ctx.roles.includes('approver') && minRank <= 2) {
      return true;
    }
    if (ctx.roles.includes('user') && minRank <= 1) {
      return true;
    }

    throw new ForbiddenException('Insufficient permission');
  }
}
