import { ForbiddenException } from '@nestjs/common';
import { AuthZService, type HierarchyPermissionLevel } from '../auth/auth-z.service';

export async function assertAnyHierarchyPermission(
  authZ: AuthZService,
  accessToken: string,
  userId: number,
  checks: Array<{ hierarchy: string; level: HierarchyPermissionLevel }>,
): Promise<void> {
  for (const { hierarchy, level } of checks) {
    try {
      await authZ.assertHierarchyPermission(accessToken, userId, hierarchy, level);
      return;
    } catch {
      /* try next hierarchy */
    }
  }
  throw new ForbiddenException('Insufficient permission for this operation');
}
