import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { EnterpriseRoleSlug } from '../auth.constants';
import type { ResolvedAuthContext } from '../auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<EnterpriseRoleSlug[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const req = context.switchToHttp().getRequest<{ authContext?: ResolvedAuthContext }>();
    const ctx = req.authContext;
    if (!ctx?.roles?.length) {
      throw new ForbiddenException('Insufficient role');
    }
    const has = required.some((r) => ctx.roles.includes(r));
    if (!has) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
