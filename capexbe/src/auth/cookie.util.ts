/** Minimal cookie parser — avoids extra dependency when npm install is constrained. */
export function parseCookies(
  header: string | undefined,
): Record<string, string> {
  if (!header?.trim()) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}
