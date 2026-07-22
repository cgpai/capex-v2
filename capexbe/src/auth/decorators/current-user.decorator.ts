import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ResolvedAuthContext } from '../auth.types';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ResolvedAuthContext | undefined => {
    const req = ctx.switchToHttp().getRequest<{ authContext?: ResolvedAuthContext }>();
    return req.authContext;
  },
);
