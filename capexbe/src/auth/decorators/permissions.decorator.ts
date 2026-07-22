import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

export type RequiredPermission = {
  hierarchy: string;
  level: 'view' | 'update' | 'create' | 'delete';
};

export const RequirePermission = (hierarchy: string, level: RequiredPermission['level']) =>
  SetMetadata(PERMISSION_KEY, { hierarchy, level } satisfies RequiredPermission);
