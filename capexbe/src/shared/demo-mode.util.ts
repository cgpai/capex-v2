/** Local demo / LAN preview — set CAPEX_DEMO_MODE=true in capexbe/.env only. */
export function isDemoMode(): boolean {
  return process.env.CAPEX_DEMO_MODE === 'true';
}

/** Private LAN origins for demo (192.168.x.x, 10.x, 172.16–31.x, localhost). */
export function isDemoLanOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(
    origin,
  );
}
