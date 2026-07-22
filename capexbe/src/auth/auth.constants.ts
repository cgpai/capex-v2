export const ACCESS_COOKIE = 'capex_access';
export const REFRESH_COOKIE = 'capex_refresh';
export const CSRF_COOKIE = 'capex_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';

/** Short-lived PKCE verifier for Azure OAuth (httpOnly, cleared after callback). */
export const OAUTH_PKCE_COOKIE = 'capex_oauth_pkce';
export const OAUTH_RETURN_COOKIE = 'capex_oauth_return';
export const OAUTH_COOKIE_TTL_SEC = 10 * 60;

/** Access JWT lifetime (seconds). */
export const ACCESS_TOKEN_TTL_SEC = 3 * 60 * 60;
/** Refresh token lifetime (seconds). */
export const REFRESH_TOKEN_TTL_SEC = 7 * 24 * 60 * 60;
/** Absolute session cap — max lifetime from first login (ms). */
export const ABSOLUTE_SESSION_MS = REFRESH_TOKEN_TTL_SEC * 1000;

const IDLE_TIMEOUT_MS = 3 * 60 * 60 * 1000;
/** Idle timeout (tab hidden) for sensitive roles (ms). */
export const IDLE_TIMEOUT_SENSITIVE_MS = IDLE_TIMEOUT_MS;
/** Idle timeout (tab hidden) for standard users (ms). */
export const IDLE_TIMEOUT_STANDARD_MS = IDLE_TIMEOUT_MS;

export const SENSITIVE_ROLE_SLUGS = new Set(['super_admin', 'pmo']);

export const ENTERPRISE_ROLE_SLUGS = [
  'super_admin',
  'pmo',
  'manager',
  'approver',
  'user',
] as const;

export type EnterpriseRoleSlug = (typeof ENTERPRISE_ROLE_SLUGS)[number];

function normalizeRoleToken(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Super Admin is a global role and bypasses all authorization checks. */
export function isSuperAdminRole(roleNameOrSlug: string | null | undefined): boolean {
  const n = normalizeRoleToken(roleNameOrSlug);
  return n === 'superadmin' || n === 'superadministrator';
}

/** Map display role names from DB to enterprise slugs. */
export function roleNameToSlug(roleName: string | null | undefined): EnterpriseRoleSlug {
  const n = normalizeRoleToken(roleName);
  if (isSuperAdminRole(roleName)) return 'super_admin';
  if (n === 'pmo' || n === 'projectmanagementoffice') return 'pmo';
  if (n === 'management' || n === 'manager' || n === 'manajemen') return 'manager';
  if (n === 'approver' || n === 'approval') return 'approver';
  return 'user';
}
