import { AuthZService } from '../auth/auth-z.service';

/** Email/phone in user directory — admin, PMO, or User Management viewers only (+ self always applied in sanitizer). */
export async function viewerCanSeeUserPii(
  authZ: AuthZService,
  accessToken: string,
  viewerUserId: number,
): Promise<boolean> {
  try {
    await authZ.assertAnyRole(accessToken, viewerUserId, ['super_admin', 'pmo']);
    return true;
  } catch {
    /* fall through */
  }
  try {
    await authZ.assertHierarchyPermission(accessToken, viewerUserId, 'User Management', 'view');
    return true;
  } catch {
    return false;
  }
}

/** Full user directory in bootstrap — not every authenticated user. */
export async function viewerCanLoadUserDirectory(
  authZ: AuthZService,
  accessToken: string,
  viewerUserId: number,
): Promise<boolean> {
  if (await viewerCanSeeUserPii(authZ, accessToken, viewerUserId)) {
    return true;
  }
  try {
    await authZ.assertConfigurationAccess(accessToken, viewerUserId);
    return true;
  } catch {
    return false;
  }
}

/** Vendor NPWP — configuration admins only (slice already gated by assertConfigurationAccess). */
export async function viewerCanSeeVendorTaxId(
  authZ: AuthZService,
  accessToken: string,
  viewerUserId: number,
): Promise<boolean> {
  try {
    await authZ.assertConfigurationAccess(accessToken, viewerUserId);
    return true;
  } catch {
    return false;
  }
}
