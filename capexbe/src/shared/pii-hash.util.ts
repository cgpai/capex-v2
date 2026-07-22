import { createHash } from 'crypto';

/** Stable short hash for correlating records in logs without exposing raw PII. */
export function hashIdentifier(value: string, length = 12): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return '';
  return createHash('sha256').update(normalized).digest('hex').slice(0, length);
}

/** j***@domain.com — usable in lists where email hint helps ops without full exposure. */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return '***';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const maskedLocal = local.length <= 1 ? '*' : `${local[0]}***`;
  return `${maskedLocal}@${domain}`;
}

/** +62 ***1234 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-4)}`;
}

/** NPWP / tax id: show last 4 digits only in egress for non-admin viewers. */
export function maskTaxId(npwp: string): string {
  const digits = npwp.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-4)}`;
}

export function sanitizeVendorRecord(
  vendor: Record<string, unknown>,
  includeTaxId: boolean,
): Record<string, unknown> {
  const out = { ...vendor };
  if (!includeTaxId && 'npwp' in out) {
    const raw = String(out.npwp ?? '').trim();
    out.npwp = raw ? maskTaxId(raw) : '';
  }
  return out;
}
