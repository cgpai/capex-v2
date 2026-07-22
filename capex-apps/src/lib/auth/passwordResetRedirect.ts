/** Halaman login (root) — recovery hash hanya diproses di LoginPage. */
export function getPasswordResetRedirectUrl(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.origin}/`;
}
