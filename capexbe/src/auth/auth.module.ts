import { Global, Module } from '@nestjs/common';

import { AuthController } from './auth.controller';

import { AuthService } from './auth.service';

import { AuthContextService } from './auth-context.service';

import { JwtTokenService } from './jwt-token.service';

import { SessionService } from './session.service';

import { AuthUserResolver } from './auth-user.resolver';

import { AuthAuditService } from './auth-audit.service';

import { AuthRateLimiterService } from './auth-rate-limiter.service';

import { CsrfService } from './csrf.service';

import { SuspiciousLoginService } from './suspicious-login.service';

import { SupabaseJwtService } from './supabase-jwt.service';
import { AuthZService } from './auth-z.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthContextService,
    AuthZService,
    JwtTokenService,
    SessionService,
    AuthUserResolver,
    AuthAuditService,
    AuthRateLimiterService,
    CsrfService,
    SuspiciousLoginService,
    SupabaseJwtService,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
  ],
  exports: [
    AuthService,
    AuthContextService,
    AuthZService,
    AuthUserResolver,
    JwtTokenService,
    SessionService,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
  ],
})
export class AuthModule {}

