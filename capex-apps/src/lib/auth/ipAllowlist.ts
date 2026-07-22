import type { NextRequest } from 'next/server';
import { clientIp } from './edgeSession';

const LOCALHOST_IPS = new Set(['127.0.0.1', '::1', 'localhost']);

function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

/** Comma-separated public IPs allowed to reach the app when set (server env only). */
export function parseIpAllowlist(raw: string | undefined): Set<string> | null {
  if (!raw?.trim()) return null;
  const ips = raw
    .split(',')
    .map((s) => normalizeIp(s.trim()))
    .filter(Boolean);
  if (ips.length === 0) return null;
  return new Set(ips);
}

export function isIpAllowed(ip: string, allowlist: Set<string> | null): boolean {
  if (!allowlist) return true;
  const normalized = normalizeIp(ip);
  if (LOCALHOST_IPS.has(normalized)) return true;
  return allowlist.has(normalized);
}

let cachedAllowlist: Set<string> | null | undefined;

function getAllowlist(): Set<string> | null {
  if (cachedAllowlist === undefined) {
    cachedAllowlist = parseIpAllowlist(process.env.IP_ALLOWLIST);
  }
  return cachedAllowlist;
}

export function ipAllowlistEnabled(): boolean {
  return getAllowlist() !== null;
}

const TUNNEL_HOST_MARKERS = ['.devtunnels.ms', '.cursor.sh', 'vscode.dev', '.trycloudflare.com', '.ngrok-free.app', '.ngrok.io'];

/** Microsoft dev tunnels / Cursor port-forward host — bypass IP allowlist. */
export function isCursorTunnelRequest(req: NextRequest): boolean {
  if (process.env.CURSOR_TUNNEL_MODE === 'true') return true;
  const host = (req.headers.get('host') ?? req.headers.get('x-forwarded-host') ?? '').toLowerCase();
  return TUNNEL_HOST_MARKERS.some((m) => host.includes(m));
}

export function requestIpAllowed(req: NextRequest): boolean {
  if (isCursorTunnelRequest(req)) return true;
  return isIpAllowed(clientIp(req), getAllowlist());
}
