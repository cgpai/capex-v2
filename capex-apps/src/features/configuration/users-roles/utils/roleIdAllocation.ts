import { MAX_APP_ROLE_ID } from '@/features/configuration/shared/configConstants';
import type { UserRole } from '@/types';

export function allocateNextRoleId(existing: UserRole[]): number {
  const maxId = existing.reduce(
    (max, role) => (role.id > max && role.id <= MAX_APP_ROLE_ID ? role.id : max),
    0,
  );
  return maxId + 1;
}
