import { NAV_ITEMS, MAIN_NAV_LANDING_PAGE } from '../constants';
import type { Page, User, UserRole } from '../types';
import { buildConsolidatedPermissionMap, canAccessPageWithPermissionMap } from './rolePermissionMatrix';

/**
 * Halaman setelah login: item pertama di sidebar (urutan `NAV_ITEMS`) yang
 * user punya minimal View (Role Management → Akses Screen / Navigasi).
 */
export async function resolvePostLoginLandingPage(
  user: User,
  allRoles: UserRole[],
): Promise<Page> {
  const permMap = buildConsolidatedPermissionMap(user, allRoles);

  for (const item of NAV_ITEMS) {
    if (!canAccessPageWithPermissionMap(permMap, item.label)) continue;
    return item.label;
  }

  return MAIN_NAV_LANDING_PAGE;
}
