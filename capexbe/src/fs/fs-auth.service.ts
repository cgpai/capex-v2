import { Injectable } from '@nestjs/common';
import { AuthContextService } from '../auth/auth-context.service';

/**
 * Legacy entry point used by FS modules — delegates to centralized auth context.
 * Binds app user id from JWT identity; rejects mismatched client userId.
 */
@Injectable()
export class FsAuthService {
  constructor(private readonly authContext: AuthContextService) {}

  async getAuthenticatedRlsClient(accessToken: string, userId: number) {
    return this.authContext.getRlsClient(accessToken, userId);
  }
}
