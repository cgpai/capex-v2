import {

  Body,

  Controller,

  Get,

  Post,

  Query,

  Req,

  Res,

  UseGuards,

  BadRequestException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { AuthContextService } from './auth-context.service';
import { isPasswordLoginDisabled } from '../shared/prod-env.util';

import { CsrfService } from './csrf.service';

import { validateLoginDto } from './dto/login.dto';

import { validateForgotPasswordDto } from './dto/forgot-password.dto';

import { parseLogoutDto } from './dto/logout.dto';

import { parseCookies } from './cookie.util';

import { Public } from './decorators/public.decorator';

import { ACCESS_COOKIE, REFRESH_COOKIE, OAUTH_PKCE_COOKIE, OAUTH_RETURN_COOKIE } from './auth.constants';



@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(

    private readonly auth: AuthService,

    private readonly csrf: CsrfService,

    private readonly authContext: AuthContextService,

  ) {}



  /** Browser sends Supabase access token after signInWithPassword (no password on server). */

  @Public()
  @Post('exchange')

  async exchange(@Req() req: Request, @Res({ passthrough: true }) res: Response) {

    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();

    if (!bearer) {

      throw new BadRequestException('Missing Authorization Bearer token');

    }

    try {
      return await this.auth.exchange(bearer, res, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`POST /auth/exchange failed: ${message}`);
      throw error;
    }

  }



  @Public()
  @Post('login')

  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {

    if (isPasswordLoginDisabled()) {
      throw new UnauthorizedException('Password login is disabled. Use SSO to sign in.');
    }

    let dto;

    try {

      dto = validateLoginDto(body);

    } catch {

      throw new BadRequestException('Invalid login payload');

    }

    return this.auth.login(dto.email, dto.password, res, {

      ip: req.ip,

      userAgent: req.headers['user-agent'],

    });

  }



  @Public()
  @Post('forgot-password')

  async forgotPassword(@Body() body: unknown, @Req() req: Request) {

    if (isPasswordLoginDisabled()) {
      return {
        ok: true,
        message: 'If an account exists for that email, a reset link has been sent.',
      };
    }

    let dto;

    try {

      dto = validateForgotPasswordDto(body);

    } catch {

      throw new BadRequestException('Invalid forgot-password payload');

    }

    return this.auth.forgotPassword(dto.email, dto.redirectTo, {

      ip: req.ip,

      userAgent: req.headers['user-agent'],

    });

  }



  @Public()
  @Post('refresh')

  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {

    const cookies = parseCookies(req.headers.cookie);

    const refreshRaw = cookies[REFRESH_COOKIE];

    if (!refreshRaw?.trim()) {

      throw new UnauthorizedException('Missing refresh token');

    }

    this.csrf.assertValid(req.method, cookies, req.headers);

    return this.auth.refresh(refreshRaw, res, { ip: req.ip });

  }



  /** Session probe — must stay public so guests get `{ authenticated: false }` (not 401). */
  @Public()
  @Get('me')
  async me(@Req() req: Request) {

    const cookies = parseCookies(req.headers.cookie);

    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();

    const token = bearer || cookies[ACCESS_COOKIE];

    const me = await this.auth.me(token);

    if (!me) {

      return { authenticated: false };

    }

    return { authenticated: true, user: me };

  }



  @Post('logout')

  async logout(

    @Body() body: unknown,

    @Req() req: Request,

    @Res({ passthrough: true }) res: Response,

  ) {

    const cookies = parseCookies(req.headers.cookie);

    this.csrf.assertValid(req.method, cookies, req.headers);

    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();

    const access = bearer || cookies[ACCESS_COOKIE];

    const refresh = cookies[REFRESH_COOKIE];

    const dto = parseLogoutDto(body);

    await this.auth.logout(access, refresh, res, {

      ip: req.ip,

      userAgent: req.headers['user-agent'],

      allDevices: dto.allDevices,

    });

    return { ok: true };

  }



  @Post('change-password')
  async changePassword(@Req() req: Request, @Body() body: unknown) {
    const cookies = parseCookies(req.headers.cookie);
    this.csrf.assertValid(req.method, cookies, req.headers);
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
    const token = bearer || cookies[ACCESS_COOKIE];
    if (!token?.trim()) {
      throw new UnauthorizedException('Missing access token');
    }
    const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const currentPassword = typeof o.currentPassword === 'string' ? o.currentPassword : '';
    const newPassword = typeof o.newPassword === 'string' ? o.newPassword : '';
    const ctx = await this.authContext.resolve(token);
    return this.auth.changePassword(token, ctx.userId, currentPassword, newPassword);
  }

  @Public()
  @Get('azure/start')
  async azureStart(
    @Query('returnTo') returnTo: string | undefined,
    @Res() res: Response,
  ) {
    const location = this.auth.startAzureOAuth(returnTo, res);
    return res.redirect(302, location);
  }

  @Public()
  @Get('azure/callback')
  async azureCallback(
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const cookies = parseCookies(req.headers.cookie);
    const location = await this.auth.completeAzureOAuth(
      code,
      cookies[OAUTH_PKCE_COOKIE],
      cookies[OAUTH_RETURN_COOKIE],
      error,
      errorDescription,
      res,
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
    return res.redirect(302, location);
  }

  @Post('heartbeat')
  async heartbeat(@Req() req: Request) {

    const cookies = parseCookies(req.headers.cookie);

    this.csrf.assertValid(req.method, cookies, req.headers);

    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();

    const token = bearer || cookies[ACCESS_COOKIE];

    return this.auth.heartbeat(token, { ip: req.ip });

  }

}

