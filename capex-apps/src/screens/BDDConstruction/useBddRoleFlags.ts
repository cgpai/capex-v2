import { useMemo } from 'react';
import type { User } from '../../types';
import type { BddRoleFlags } from './listUtils';

export function useBddRoleFlags(currentUser: User): BddRoleFlags {
  const isSuperAdmin = useMemo(
    () => currentUser?.assignments.some((a) => a.roleName === 'Super Admin') || false,
    [currentUser],
  );
  const hasBDDRole = useMemo(() => {
    if (isSuperAdmin) return true;
    return currentUser?.assignments.some((a) => a.roleName === 'BDD') || false;
  }, [currentUser, isSuperAdmin]);
  return { isSuperAdmin, hasBDDRole };
}
