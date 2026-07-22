import { maskEmail, maskPhone } from './pii-hash.util';

/** DB columns safe to load for user directory (never auth_id / password). */
export const USER_DIRECTORY_COLUMNS = 'id,username,email,phone_number';

export type DirectoryUser = {
  id: number;
  username: string;
  email?: string;
  phoneNumber?: string;
  assignments: Array<{ roleName: string; assignedScopes: string[] }>;
};

const INTERNAL_USER_KEYS = new Set([
  'authId',
  'auth_id',
  'password',
  'passwordHash',
  'password_hash',
]);

export function stripInternalUserFields(user: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(user)) {
    if (!INTERNAL_USER_KEYS.has(key)) out[key] = value;
  }
  return out;
}

/** Directory payload: full PII for self or privileged viewers; masked for everyone else. */
export function sanitizeUserForDirectory(
  user: Record<string, unknown>,
  viewerUserId: number,
  includePii: boolean,
): DirectoryUser {
  const base = stripInternalUserFields(user);
  const id = Number(base.id);
  const assignments = Array.isArray(base.assignments) ? base.assignments : [];
  const isSelf = Number(viewerUserId) === id;

  const out: DirectoryUser = {
    id,
    username: String(base.username ?? ''),
    assignments: assignments as DirectoryUser['assignments'],
  };

  const email = String(base.email ?? '').trim();
  const phoneRaw = base.phoneNumber ?? base.phone_number;
  const phone = phoneRaw != null ? String(phoneRaw).trim() : '';

  if (includePii || isSelf) {
    if (email) out.email = email;
    if (phone) out.phoneNumber = phone;
  } else {
    if (email) out.email = maskEmail(email);
    if (phone) out.phoneNumber = maskPhone(phone);
  }

  return out;
}

export function sanitizeUsersForDirectory(
  users: Record<string, unknown>[],
  viewerUserId: number,
  includePii: boolean,
): DirectoryUser[] {
  return users.map((u) => sanitizeUserForDirectory(u, viewerUserId, includePii));
}
