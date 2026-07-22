import type { Request } from 'express';

const LOCALHOST_IPS = new Set(['127.0.0.1', '::1', 'localhost']);
const TUNNEL_HOST_MARKERS = ['.devtunnels.ms', '.cursor.sh', 'vscode.dev', '.trycloudflare.com', '.ngrok-free.app', '.ngrok.io'];

function isCursorTunnelRequest(req: Request): boolean {
  if (process.env.CURSOR_TUNNEL_MODE === 'true') return true;
  const host = String(req.headers.host ?? req.headers['x-forwarded-host'] ?? '').toLowerCase();
  return TUNNEL_HOST_MARKERS.some((m) => host.includes(m));
}

function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

export function parseIpAllowlist(raw: string | undefined): Set<string> | null {
  if (!raw?.trim()) return null;
  const ips = raw
    .split(',')
    .map((s) => normalizeIp(s.trim()))
    .filter(Boolean);
  if (ips.length === 0) return null;
  return new Set(ips);
}

export function clientIpFromRequest(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return normalizeIp(forwarded.split(',')[0] ?? 'unknown');
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return normalizeIp(forwarded[0]);
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return normalizeIp(realIp);
  }
  return normalizeIp(req.ip || req.socket?.remoteAddress || 'unknown');
}

export function isIpAllowed(ip: string, allowlist: Set<string> | null): boolean {
  if (!allowlist) return true;
  const normalized = normalizeIp(ip);
  if (LOCALHOST_IPS.has(normalized)) return true;
  return allowlist.has(normalized);
}

let cachedAllowlist: Set<string> | null | undefined;

export function getIpAllowlist(): Set<string> | null {
  if (cachedAllowlist === undefined) {
    cachedAllowlist = parseIpAllowlist(process.env.IP_ALLOWLIST);
  }
  return cachedAllowlist;
}

export function requestIpAllowed(req: Request): boolean {
  if (isCursorTunnelRequest(req)) return true;
  return isIpAllowed(clientIpFromRequest(req), getIpAllowlist());
}
