/** Detect corporate proxy / Windows TLS issues on outbound fetch to Supabase. */
export function isTlsFetchError(err: unknown): boolean {
  const parts: string[] = [];
  const visit = (e: unknown, depth = 0): void => {
    if (e == null || typeof e !== 'object' || depth > 6) return;
    const o = e as {
      code?: string;
      message?: string;
      name?: string;
      cause?: unknown;
      errors?: unknown[];
    };
    if (o.code) parts.push(o.code);
    if (o.message) parts.push(o.message);
    if (o.name) parts.push(o.name);
    if (o.cause) visit(o.cause, depth + 1);
    if (Array.isArray(o.errors)) {
      for (const nested of o.errors) visit(nested, depth + 1);
    }
  };
  visit(err);
  const haystack = parts.join(' ').toLowerCase();
  return (
    haystack.includes('unable_to_verify_leaf_signature') ||
    haystack.includes('unable to verify') ||
    haystack.includes('self signed certificate') ||
    haystack.includes('certificate') ||
    haystack.includes('fetch failed')
  );
}
