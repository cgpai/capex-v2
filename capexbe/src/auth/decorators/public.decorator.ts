import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Skip global JwtAuthGuard for this route (login, health, etc.). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
