import './preload';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseHttpsFetch } from './supabase-https-fetch';

/** Node https fetch so win-ca / NODE_EXTRA_CA_CERTS apply on Windows corporate networks. */
export function supabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return supabaseHttpsFetch(input, init);
}

export function getSupabaseUrl(): string {
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
}

export function getSupabaseAnonKey(): string {
  return (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
}

/**
 * Service role bypasses RLS — only use when explicitly configured.
 * Do not fall back to anon key (that is not a service role).
 */
export function getSupabaseServiceKey(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

export function createSupabaseClient(
  key: string,
  options?: { accessToken?: string },
): SupabaseClient {
  const url = getSupabaseUrl();
  if (!url || !key) {
    throw new Error('Supabase URL/key not configured');
  }
  return createClient(url, key, {
    global: {
      fetch: supabaseFetch,
      headers: options?.accessToken
        ? { Authorization: `Bearer ${options.accessToken}` }
        : undefined,
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
