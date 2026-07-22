import {
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_TOKEN_TTL_SEC,
  OAUTH_COOKIE_TTL_SEC,
  OAUTH_PKCE_COOKIE,
  OAUTH_RETURN_COOKIE,
} from './auth.constants';
import { JwtTokenService } from './jwt-token.service';
import { SessionService } from './session.service';
import { AuthUserResolver } from './auth-user.resolver';
import { AuthAuditService } from './auth-audit.service';
import { AuthRateLimiterService } from './auth-rate-limiter.service';
import { CsrfService } from './csrf.service';
import { SuspiciousLoginService } from './suspicious-login.service';
import { SupabaseJwtService } from './supabase-jwt.service';
import type { AuthMeDto, AuthSessionMetaDto } from './auth.types';
import type { ResolvedAppUser } from './auth-user.resolver';
import { isTlsFetchError } from '../shared/tls-fetch-error';
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  createSupabaseClient,
  getSupabaseServiceKey,
} from '../shared/supabase-client.factory';
import { supabaseHttpsFetch } from '../shared/supabase-https-fetch';
import { generateCodeChallenge, generateCodeVerifier } from './oauth-pkce.util';

function cookieOptions(maxAgeSec: number) {
  const secure = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeSec * 1000,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtTokenService,
    private readonly sessions: SessionService,
    private readonly users: AuthUserResolver,
    private readonly audit: AuthAuditService,
    private readonly rateLimiter: AuthRateLimiterService,
    private readonly csrf: CsrfService,
    private readonly suspicious: SuspiciousLoginService,
    private readonly supabaseJwt: SupabaseJwtService,
  ) {}

  idleTimeoutMs(roles: string[]): number {
    return this.sessions.idleTimeoutMsForRoles(roles);
  }

  toMeDto(user: ResolvedAppUser, sessionMeta?: AuthSessionMetaDto): AuthMeDto {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      roles: user.roles,
      assignments: (user.assignments ?? []).map((a) => ({
        roleName: a.roleName,
        assignedScopes: Array.isArray(a.assignedScopes) ? a.assignedScopes : [],
      })),
      idleTimeoutMs: this.idleTimeoutMs(user.roles),
      session: sessionMeta,
    };
  }

  setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    res.cookie(ACCESS_COOKIE, accessToken, cookieOptions(ACCESS_TOKEN_TTL_SEC));
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(REFRESH_TOKEN_TTL_SEC));
    const csrfToken = this.csrf.generateToken();
    this.csrf.setCsrfCookie(res, csrfToken, REFRESH_TOKEN_TTL_SEC);
  }

  clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    this.csrf.clearCsrfCookie(res);
  }

  private accessExpiresAtFromToken(accessToken: string): number {
    try {
      const payload = this.jwt.verifyAccess(accessToken);
      if (payload.exp) return payload.exp * 1000;
    } catch {
      /* fallback */
    }
    return Date.now() + ACCESS_TOKEN_TTL_SEC * 1000;
  }

  private async buildSessionMeta(
    sessionId: string,
    user: ResolvedAppUser,
    accessToken: string,
  ): Promise<AuthSessionMetaDto | undefined> {
    const accessExpiresAt = this.accessExpiresAtFromToken(accessToken);
    const meta = await this.sessions.getSessionMeta(
      sessionId,
      user.id,
      user.roles,
      accessExpiresAt,
    );
    return meta ?? undefined;
  }

  /**
   * Preferred login: browser verified password with Supabase; exchange JWT for backend session.
   */
  async exchange(
    supabaseAccessToken: string,
    res: Response,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<AuthMeDto> {
    const token = supabaseAccessToken?.trim();
    if (!token) {
      throw new UnauthorizedException('Missing Supabase access token');
    }

    this.rateLimiter.assertAllowed('exchange', meta?.ip ?? 'unknown');

    const claims = await this.supabaseJwt.verifyAccessToken(token);

    let appUser: ResolvedAppUser;
    try {
      // Use the caller's Supabase JWT during exchange so user resolution can
      // still work under RLS even when service-role env is unavailable.
      const client = this.users.createAnonClient(token);
      appUser = await this.users.resolveAppUserByAuthId(
        client,
        claims.sub,
        claims.email,
      );
    } catch (e) {
      if (isTlsFetchError(e)) {
        throw new ServiceUnavailableException(
          'Server cannot reach database (TLS). Set SUPABASE_CA_CERT_PATH or install win-ca.',
        );
      }
      throw e;
    }

    return this.establishSession(appUser, claims.sub, res, {
      email: appUser.email,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });
  }

  private async establishSession(
    appUser: ResolvedAppUser,
    authId: string,
    res: Response,
    meta?: { email?: string; ip?: string | null; userAgent?: string | null },
  ): Promise<AuthMeDto> {
    const suspiciousResult = await this.suspicious.evaluate({
      userId: appUser.id,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    let stored;
    let accessToken: string;
    try {
      const { raw: refreshRaw, hash, expiresAt } = this.jwt.createRefreshToken();
      stored = await this.sessions.createSession({
        userId: appUser.id,
        authId,
        refreshRaw,
        refreshHash: hash,
        expiresAt,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      });

      accessToken = this.jwt.signAccess({
        sub: appUser.id,
        authId,
        sid: stored.id,
        roles: appUser.roles,
      });

      this.setAuthCookies(res, accessToken, refreshRaw);
    } catch (e) {
      if (isTlsFetchError(e)) {
        throw new ServiceUnavailableException(
          'Could not create session (TLS). Run auth_sessions migration and configure SUPABASE_CA_CERT_PATH if needed.',
        );
      }
      throw e;
    }

    await this.audit.logLogin({
      userId: appUser.id,
      authId,
      email: meta?.email ?? appUser.email,
      success: true,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      eventType: 'login',
      isSuspicious: suspiciousResult.suspicious,
      metadata: suspiciousResult.reasons.length
        ? { reasons: suspiciousResult.reasons }
        : undefined,
    });

    const sessionMeta = await this.buildSessionMeta(stored.id, appUser, accessToken);
    return this.toMeDto(appUser, sessionMeta);
  }

  /** Legacy: password login on server (may fail TLS on locked-down Windows networks). */
  async login(
    email: string,
    password: string,
    res: Response,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<AuthMeDto> {
    const key = `${email.trim().toLowerCase()}:${meta?.ip ?? 'unknown'}`;
    this.rateLimiter.assertAllowed('login', key);

    const anon = this.users.createAnonClient();
    let data: Awaited<ReturnType<typeof anon.auth.signInWithPassword>>['data'];
    let error: Awaited<ReturnType<typeof anon.auth.signInWithPassword>>['error'];
    try {
      const result = await anon.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      data = result.data;
      error = result.error;
    } catch (e) {
      if (isTlsFetchError(e)) {
        throw new ServiceUnavailableException(
          'Auth API unreachable from server (TLS). Use browser login (exchange) or set SUPABASE_CA_CERT_PATH.',
        );
      }
      throw e;
    }

    if (error || !data?.session?.access_token || !data.user) {
      await this.audit.logLogin({
        email,
        success: false,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
        eventType: 'login_failed',
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    const appUser = await this.users.resolveAppUserByAuthId(
      anon,
      data.user.id,
      data.user.email,
    );

    return this.establishSession(appUser, data.user.id, res, {
      email,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });
  }

  async refresh(
    refreshRaw: string | undefined,
    res: Response,
    meta?: { ip?: string },
  ): Promise<AuthMeDto> {
    if (!refreshRaw?.trim()) {
      throw new UnauthorizedException('Missing refresh token');
    }

    this.rateLimiter.assertAllowed('refresh', meta?.ip ?? 'unknown');

    const session = await this.sessions.findValidSession(refreshRaw.trim());
    const anon = this.users.createAnonClient();
    const appUser = await this.users.resolveAppUserByAuthId(anon, session.authId);

    const idleMs = this.idleTimeoutMs(appUser.roles);
    this.sessions.assertNotIdle(session.lastActiveAt, idleMs);

    const { raw: newRaw, hash, expiresAt } = this.jwt.createRefreshToken();
    const rotated = await this.sessions.rotateSession(
      session,
      refreshRaw.trim(),
      newRaw,
      hash,
      expiresAt,
    );

    const accessToken = this.jwt.signAccess({
      sub: appUser.id,
      authId: session.authId,
      sid: rotated.id,
      roles: appUser.roles,
    });

    this.setAuthCookies(res, accessToken, newRaw);
    await this.sessions.touchSession(rotated.id);

    await this.audit.logLogin({
      userId: appUser.id,
      authId: session.authId,
      email: appUser.email,
      success: true,
      ip: meta?.ip,
      eventType: 'token_refresh',
    });

    const sessionMeta = await this.buildSessionMeta(rotated.id, appUser, accessToken);
    return this.toMeDto(appUser, sessionMeta);
  }

  async me(accessToken: string | undefined): Promise<AuthMeDto | null> {
    if (!accessToken?.trim()) return null;
    try {
      const payload = this.jwt.verifyAccess(accessToken.trim());
      if (payload.sid) {
        const active = await this.sessions.assertSessionActive(
          payload.sid,
          payload.sub,
        );
        if (!active) return null;
      }
      const anon = this.users.createAnonClient();
      const appUser = await this.users.resolveAppUserByAuthId(
        anon,
        payload.authId,
      );

      const sessionMeta = payload.sid
        ? await this.buildSessionMeta(payload.sid, appUser, accessToken.trim())
        : undefined;

      return this.toMeDto(appUser, sessionMeta);
    } catch {
      return null;
    }
  }

  async logout(
    accessToken: string | undefined,
    refreshRaw: string | undefined,
    res: Response,
    meta?: {
      ip?: string;
      userAgent?: string;
      allDevices?: boolean;
    },
  ): Promise<void> {
    try {
      if (accessToken?.trim()) {
        const payload = this.jwt.verifyAccess(accessToken.trim());
        if (payload.sid) {
          await this.sessions.revokeSession(payload.sid);
        }
        if (meta?.allDevices) {
          await this.sessions.revokeAllForUser(payload.sub);
        }
        await this.audit.logSessionEvent({
          userId: payload.sub,
          success: true,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
          eventType: 'logout',
        });
      } else if (refreshRaw?.trim()) {
        const session = await this.sessions.findValidSession(refreshRaw.trim());
        await this.sessions.revokeSession(session.id);
        if (meta?.allDevices) {
          await this.sessions.revokeAllForUser(session.userId);
        }
      }
    } catch {
      /* best-effort */
    }
    this.clearAuthCookies(res);
  }

  async heartbeat(
    accessToken: string | undefined,
    meta?: { ip?: string },
  ): Promise<{ ok: boolean }> {
    if (!accessToken?.trim()) return { ok: false };

    this.rateLimiter.assertAllowed('heartbeat', meta?.ip ?? 'unknown');

    try {
      const payload = this.jwt.verifyAccess(accessToken.trim());
      if (payload.sid) {
        await this.sessions.touchSession(payload.sid);
      }
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  /**
   * Change password for the authenticated app user (verifies current password server-side).
   */
  async changePassword(
    accessToken: string,
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ ok: true }> {
    const current = String(currentPassword ?? '');
    const next = String(newPassword ?? '');
    if (!current || current.length > 256) {
      throw new BadRequestException('Password saat ini tidak valid.');
    }
    if (!next || next.length < 6 || next.length > 256) {
      throw new BadRequestException('Password baru minimal 6 karakter.');
    }

    const payload = this.jwt.verifyAccess(accessToken);
    const anon = this.users.createAnonClient(accessToken);
    const appUser = await this.users.resolveAppUserByAuthId(anon, payload.authId);
    if (Number(appUser.id) !== Number(userId)) {
      throw new UnauthorizedException('Invalid session user');
    }

    const email = String(appUser.email ?? '').trim().toLowerCase();
    if (!email) throw new BadRequestException('Email akun tidak ditemukan.');

    const verifyClient = this.users.createAnonClient();
    const { error: verifyErr } = await verifyClient.auth.signInWithPassword({
      email,
      password: current,
    });
    if (verifyErr) {
      throw new UnauthorizedException('Password saat ini salah.');
    }

    const authId = String(appUser.auth_id ?? '').trim();
    if (!authId) {
      throw new BadRequestException('Akun belum terhubung ke auth. Hubungi admin.');
    }

    const serviceKey = getSupabaseServiceKey();
    if (!serviceKey) {
      throw new ServiceUnavailableException('Auth admin not configured');
    }
    const admin = createSupabaseClient(serviceKey);
    const { error: updateErr } = await admin.auth.admin.updateUserById(authId, {
      password: next,
    });
    if (updateErr) {
      throw new BadRequestException(updateErr.message || 'Gagal mengubah password.');
    }

    return { ok: true };
  }

  /**
   * Request password reset email via Supabase Auth (default Supabase mailer).
   * Always returns a generic success message to avoid email enumeration.
   */
  async forgotPassword(
    email: string,
    redirectTo: string | undefined,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<{ ok: true; message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    this.rateLimiter.assertAllowed(
      'forgot_password',
      `${normalizedEmail}:${meta?.ip ?? 'unknown'}`,
    );

    const safeRedirect = this.resolvePasswordResetRedirect(redirectTo);
    const anon = this.users.createAnonClient();

    try {
      const { error } = await anon.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: safeRedirect,
      });

      await this.audit.logLogin({
        email: normalizedEmail,
        success: !error,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
        eventType: 'password_reset_request',
        metadata: error ? { reason: error.message, status: error.status } : undefined,
      });

      if (error) {
        this.throwForgotPasswordError(error);
      }
    } catch (e) {
      if (isTlsFetchError(e)) {
        throw new ServiceUnavailableException(
          'Auth API unreachable from server (TLS). Set SUPABASE_CA_CERT_PATH or use browser reset.',
        );
      }
      throw e;
    }

    return {
      ok: true,
      message:
        'Jika email terdaftar, Anda akan menerima link reset password dari Supabase.',
    };
  }

  private throwForgotPasswordError(error: { message?: string; status?: number }): never {
    const msg = (error.message ?? '').toLowerCase();
    if (error.status === 429 || msg.includes('rate limit')) {
      throw new HttpException(
        'Terlalu banyak permintaan email reset. Mailer default Supabase dibatasi (~2 email/jam). Tunggu ±1 jam lalu coba lagi, atau naikkan limit di Supabase Dashboard → Authentication → Rate Limits.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (msg.includes('not authorized')) {
      throw new HttpException(
        'Email belum diizinkan menerima email dari mailer default Supabase. Tambahkan alamat ini ke tim Supabase org, atau aktifkan Custom SMTP.',
        HttpStatus.BAD_REQUEST,
      );
    }
    throw new ServiceUnavailableException(
      'Gagal mengirim email reset password. Coba lagi nanti.',
    );
  }

  private resolvePasswordResetRedirect(clientRedirect?: string): string {
    const allowedOrigins = (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean);
    const fallbackOrigin = allowedOrigins[0] || 'http://localhost:3000';
    const fallback = `${fallbackOrigin}/`;

    if (!clientRedirect?.trim()) return fallback;

    try {
      const url = new URL(clientRedirect.trim());
      const origin = url.origin;
      if (allowedOrigins.some((allowed) => allowed === origin)) {
        return clientRedirect.trim();
      }
    } catch {
      /* invalid URL */
    }

    return fallback;
  }

  private frontendOrigin(): string {
    const explicit = process.env.FRONTEND_URL?.trim().replace(/\/$/, '');
    if (explicit) return explicit;
    const cors = (process.env.CORS_ORIGINS || '')
      .split(',')[0]
      ?.trim()
      .replace(/\/$/, '');
    return cors || 'http://localhost:3000';
  }

  private oauthCallbackUrl(): string {
    return `${this.frontendOrigin()}/api/auth/azure/callback`;
  }

  sanitizeOAuthReturnTo(raw?: string): string {
    const v = (raw || '/').trim();
    if (!v.startsWith('/') || v.startsWith('//')) return '/';
    if (v.includes('://')) return '/';
    return v;
  }

  private oauthCookieOpts(maxAgeSec: number) {
    const secure = process.env.NODE_ENV === 'production';
    return {
      httpOnly: true,
      secure,
      sameSite: 'strict' as const,
      path: '/',
      maxAge: maxAgeSec * 1000,
    };
  }

  /** Build Supabase Azure authorize URL and store PKCE verifier in httpOnly cookies. */
  startAzureOAuth(returnToRaw: string | undefined, res: Response): string {
    const base = getSupabaseUrl().replace(/\/$/, '');
    const anonKey = getSupabaseAnonKey();
    if (!base || !anonKey) {
      throw new ServiceUnavailableException('Supabase not configured for Azure OAuth');
    }

    const returnTo = this.sanitizeOAuthReturnTo(returnToRaw);
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    const callbackUrl = this.oauthCallbackUrl();

    res.cookie(OAUTH_PKCE_COOKIE, verifier, this.oauthCookieOpts(OAUTH_COOKIE_TTL_SEC));
    res.cookie(OAUTH_RETURN_COOKIE, returnTo, this.oauthCookieOpts(OAUTH_COOKIE_TTL_SEC));

    const params = new URLSearchParams({
      provider: 'azure',
      redirect_to: callbackUrl,
      code_challenge: challenge,
      code_challenge_method: 's256',
      scopes: 'openid email profile',
    });

    return `${base}/auth/v1/authorize?${params.toString()}&apikey=${encodeURIComponent(anonKey)}`;
  }

  humanizeOAuthError(raw: string): string {
    const msg = decodeURIComponent(raw).toLowerCase();
    if (msg.includes('unable to exchange external code')) {
      return (
        'Konfigurasi Azure belum benar. Periksa Redirect URI di Azure (Web) dan provider Azure di Supabase Dashboard.'
      );
    }
    if (msg.includes('error getting user email')) {
      return 'Microsoft tidak mengirim email. Pastikan scope email aktif di provider Azure.';
    }
    if (msg.includes('access_denied')) {
      return 'Login Microsoft dibatalkan atau akun tidak diizinkan.';
    }
    return raw;
  }

  /** Exchange OAuth PKCE code for Supabase token, then establish backend session. */
  async completeAzureOAuth(
    code: string | undefined,
    pkceVerifier: string | undefined,
    returnToRaw: string | undefined,
    oauthError: string | undefined,
    oauthErrorDescription: string | undefined,
    res: Response,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<string> {
    const returnTo = this.sanitizeOAuthReturnTo(returnToRaw);
    const frontend = this.frontendOrigin();

    res.clearCookie(OAUTH_PKCE_COOKIE, { path: '/' });
    res.clearCookie(OAUTH_RETURN_COOKIE, { path: '/' });

    const failRedirect = (message: string) => {
      const q = returnTo.includes('?') ? '&' : '?';
      return `${frontend}${returnTo}${q}oauth_error=${encodeURIComponent(this.humanizeOAuthError(message))}`;
    };

    if (oauthError?.trim()) {
      const detail = oauthErrorDescription?.trim() || oauthError.trim();
      return failRedirect(detail);
    }

    if (!code?.trim()) {
      return failRedirect('Login Microsoft dibatalkan atau kode OAuth tidak diterima.');
    }
    if (!pkceVerifier?.trim()) {
      return failRedirect('Sesi OAuth kedaluwarsa. Coba login lagi.');
    }

    const base = getSupabaseUrl().replace(/\/$/, '');
    const anonKey = getSupabaseAnonKey();
    if (!base || !anonKey) {
      return failRedirect('Supabase belum dikonfigurasi di server.');
    }

    let accessToken: string;
    try {
      const tokenRes = await supabaseHttpsFetch(`${base}/auth/v1/token?grant_type=pkce`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auth_code: code.trim(),
          code_verifier: pkceVerifier.trim(),
        }),
      });

      const text = await tokenRes.text();
      if (!tokenRes.ok) {
        let detail = text;
        try {
          const parsed = JSON.parse(text) as { msg?: string; message?: string; error_description?: string };
          detail = parsed.error_description ?? parsed.msg ?? parsed.message ?? text;
        } catch {
          /* raw */
        }
        return failRedirect(detail || 'Gagal menukar kode OAuth.');
      }

      const payload = JSON.parse(text) as { access_token?: string };
      accessToken = payload.access_token?.trim() ?? '';
      if (!accessToken) {
        return failRedirect('Token OAuth tidak diterima dari Supabase.');
      }
    } catch (e) {
      if (isTlsFetchError(e)) {
        return failRedirect('Server tidak dapat menghubungi Supabase Auth (TLS).');
      }
      throw e;
    }

    try {
      await this.exchange(accessToken, res, meta);
    } catch (e) {
      const message =
        e instanceof UnauthorizedException
          ? 'Akun Microsoft Anda tidak terdaftar di Capex Pro atau tidak memiliki akses. Hubungi admin.'
          : e instanceof Error
            ? e.message
            : 'Login Microsoft gagal.';
      return failRedirect(message);
    }

    return `${frontend}${returnTo}`;
  }
}
