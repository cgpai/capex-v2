import { SetMetadata } from '@nestjs/common';
import type { EnterpriseRoleSlug } from '../auth.constants';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: EnterpriseRoleSlug[]) => SetMetadata(ROLES_KEY, roles);
