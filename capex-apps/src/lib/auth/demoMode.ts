/** Local demo / LAN preview — set NEXT_PUBLIC_CAPEX_DEMO_MODE=true in .env.local only. */
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_CAPEX_DEMO_MODE === 'true';
}
