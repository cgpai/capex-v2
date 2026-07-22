import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthContextService } from '../auth-context.service';
import {
  getAccessTokenFromRequest,
  parseBodyUserId,
} from '../request-access-token.util';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { authContext?: unknown }>();
    const token = getAccessTokenFromRequest(req);
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }
    const ctx = await this.authContext.resolve(token, parseBodyUserId(req));
    (req as Request & { authContext: typeof ctx }).authContext = ctx;
    return true;
  }
}
