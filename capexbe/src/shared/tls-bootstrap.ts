import { existsSync } from 'fs';

let bootstrapped = false;

/**
 * Trust store for outbound HTTPS (Supabase) without disabling TLS verification.
 * - SUPABASE_CA_CERT_PATH → NODE_EXTRA_CA_CERTS (Node + undici fetch)
 * - win-ca → Windows system root CAs for node:https (used by supabaseHttpsFetch)
 */
export function bootstrapTls(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  const caPath = process.env.SUPABASE_CA_CERT_PATH?.trim();
  if (caPath && existsSync(caPath) && !process.env.NODE_EXTRA_CA_CERTS) {
    process.env.NODE_EXTRA_CA_CERTS = caPath;
  }

  if (process.platform === 'win32') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const winCa = require('win-ca') as { inject?: (format: string, sync: boolean) => void };
      if (typeof winCa.inject === 'function') {
        winCa.inject('+', true);
      }
    } catch {
      /* optional: npm install win-ca */
    }
  }
}
