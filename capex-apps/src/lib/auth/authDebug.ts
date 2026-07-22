/** Set `NEXT_PUBLIC_AUTH_DEBUG=true` to log auth refresh / 401 recovery in the browser console. */
export function authDebug(message: string, detail?: Record<string, unknown>): void {
  if (process.env.NEXT_PUBLIC_AUTH_DEBUG !== 'true') return;
  if (detail) {
    console.info(`[auth] ${message}`, detail);
  } else {
    console.info(`[auth] ${message}`);
  }
}
