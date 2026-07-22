/**
 * Browser auth uses httpOnly cookies via capexbe (/api/auth/*).
 * No database client in the frontend.
 */

export async function getAuthSession(): Promise<{
  data: { session: null };
  error: null;
}> {
  return { data: { session: null }, error: null };
}

/** Cookie session mode: Bearer token is not used in the browser. */
export async function getAccessTokenForBackend(): Promise<string | null> {
  return null;
}
