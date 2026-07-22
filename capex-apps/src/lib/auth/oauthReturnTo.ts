/** Allow only same-origin relative paths after OAuth (blocks open redirect). */
export function sanitizeOAuthReturnTo(raw: string | null | undefined, fallback = '/'): string {
  const value = (raw ?? fallback).trim();
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (value.includes('://') || value.includes('\\')) return fallback;
  if (!/^\/[a-zA-Z0-9/_\-?=&%.]*$/.test(value)) return fallback;
  return value;
}
