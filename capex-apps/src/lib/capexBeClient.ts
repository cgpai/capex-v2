import { useBackendSession } from './auth/authConstants';
import { authenticatedFetch } from './auth/authenticatedFetch';

export function isCapexBeConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_CAPEXBE_URL?.trim();
}

function beBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_CAPEXBE_URL?.replace(/\/$/, '') ?? '';
  if (!base.trim()) throw new Error('NEXT_PUBLIC_CAPEXBE_URL is not set');
  return base;
}

/**
 * In the browser, always proxy through `/api/be` (same-origin) so Netlify → Railway
 * does not require CORS. Server-side keeps direct BE URL when backend session is off.
 */
export function useBeBffProxy(): boolean {
  if (!isCapexBeConfigured()) return false;
  if (typeof window !== 'undefined') return true;
  return useBackendSession();
}

export function capexBeRequestUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (useBeBffProxy()) return `/api/be${normalized}`;
  return `${beBaseUrl()}${normalized}`;
}

export class CapexBeHttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'CapexBeHttpError';
    this.status = status;
  }
}

export function isCapexBeUnauthorizedError(e: unknown): boolean {
  if (e instanceof CapexBeHttpError && e.status === 401) return true;
  if (e instanceof Error) {
    const m = e.message.toLowerCase();
    return (
      m.includes('401') ||
      m.includes('unauthorized') ||
      m.includes('invalid or expired session') ||
      m.includes('missing authorization')
    );
  }
  return false;
}

export function isCapexBeNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) {
    const m = e.message.toLowerCase();
    return m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed');
  }
  if (e instanceof Error) {
    const m = e.message.toLowerCase();
    return m.includes('failed to fetch') || m.includes('network error') || m.includes('cors');
  }
  return false;
}

export async function postToCapexBe<T>(
  path: string,
  body: unknown,
  accessToken?: string | null,
): Promise<T> {
  const bff = useBeBffProxy();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await authenticatedFetch(capexBeRequestUrl(path), {
    method: 'POST',
    headers,
    credentials: bff ? 'include' : 'same-origin',
    body: JSON.stringify(body),
    retryOn401: bff && useBackendSession(),
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = text || `${res.status} ${res.statusText}`;
    if (text.trim().startsWith('{')) {
      try {
        const j = JSON.parse(text) as { message?: string | string[] };
        const m = j.message;
        msg = Array.isArray(m) ? m.join('; ') : typeof m === 'string' && m ? m : msg;
      } catch {
        /* keep raw body */
      }
    }
    throw new CapexBeHttpError(msg, res.status);
  }

  return res.json() as Promise<T>;
}
