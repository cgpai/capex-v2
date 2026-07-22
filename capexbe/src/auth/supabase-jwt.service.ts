import {
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import '../shared/preload';
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
} from '../shared/supabase-client.factory';
import { supabaseHttpsFetch } from '../shared/supabase-https-fetch';
import { isTlsFetchError } from '../shared/tls-fetch-error';

export type SupabaseJwtClaims = {
  sub: string;
  email?: string;
  role?: string;
};

const TLS_HELP =
  'Cannot reach Supabase Auth (TLS). Configure SUPABASE_CA_CERT_PATH or install win-ca (see capexbe/.env.example).';

/** Verify Supabase access JWT — local HS256 when configured, else auth.getUser. */
@Injectable()
export class SupabaseJwtService {
  /** Avoid outbound HTTPS when JWT secret is set (corporate TLS on Node). */
  private verifyLocal(token: string): SupabaseJwtClaims | null {
    const secret = process.env.SUPABASE_JWT_SECRET?.trim();
    if (!secret) return null;

    try {
      const decoded = jwt.verify(token, secret, {
        algorithms: ['HS256'],
      }) as jwt.JwtPayload & { email?: string; role?: string };
      const sub = decoded.sub;
      if (!sub || typeof sub !== 'string') return null;
      return {
        sub,
        email: typeof decoded.email === 'string' ? decoded.email : undefined,
        role: typeof decoded.role === 'string' ? decoded.role : undefined,
      };
    } catch {
      return null;
    }
  }

  async verifyAccessToken(token: string): Promise<SupabaseJwtClaims> {
    const trimmed = token?.trim();
    if (!trimmed) {
      throw new UnauthorizedException('Missing Supabase access token');
    }

    const local = this.verifyLocal(trimmed);
    if (local) return local;

    const apiKey = getSupabaseAnonKey();
    const baseUrl = getSupabaseUrl();
    if (!apiKey || !baseUrl) {
      throw new UnauthorizedException('Supabase not configured on server');
    }

    try {
      const claims = await this.fetchUserViaHttps(baseUrl, apiKey, trimmed);
      return claims;
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      if (e instanceof ServiceUnavailableException) throw e;
      if (isTlsFetchError(e)) {
        throw new ServiceUnavailableException(TLS_HELP);
      }
      throw new UnauthorizedException('Invalid or expired Supabase token');
    }
  }

  /** Auth API via node:https (win-ca) — avoids undici TLS issues on Windows. */
  private async fetchUserViaHttps(
    baseUrl: string,
    apiKey: string,
    accessToken: string,
  ): Promise<SupabaseJwtClaims> {
    const res = await supabaseHttpsFetch(`${baseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: apiKey,
      },
    });

    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new UnauthorizedException('Invalid or expired Supabase token');
      }
      let message = text;
      try {
        const parsed = JSON.parse(text) as { msg?: string; message?: string };
        message = parsed.msg ?? parsed.message ?? text;
      } catch {
        /* use raw text */
      }
      throw new UnauthorizedException(message || 'Supabase auth rejected token');
    }

    const data = JSON.parse(text) as {
      id?: string;
      email?: string;
      role?: string;
    };
    if (!data?.id) {
      throw new UnauthorizedException('Invalid or expired Supabase token');
    }
    return {
      sub: data.id,
      email: data.email ?? undefined,
      role: data.role,
    };
  }
}
