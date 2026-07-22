import { Injectable } from '@nestjs/common';
import { AuthZService } from '../auth/auth-z.service';
import { FsAuthService } from '../fs/fs-auth.service';
import { enrichFsForPeriod, filterNrFeasibilityStudies, loadFsPeriodContext } from '../fs/fs-enrichment.loader';
import { parsePeriodUserBody } from '../fs/fs.dto';

@Injectable()
export class FsRealizationService {
  constructor(
    private readonly fsAuth: FsAuthService,
    private readonly authZ: AuthZService,
  ) {}

  async loadPageBundle(accessToken: string, body: unknown) {
    const { userId, periodName } = parsePeriodUserBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'FS Realization', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const { period, categories, studies } = await loadFsPeriodContext(client, periodName);

    const allFS = filterNrFeasibilityStudies(enrichFsForPeriod(period, studies, categories, true));
    return {
      periodName,
      allFS,
      categories,
      summary: {
        totalFs: studies.length,
        approvedFs: allFS.length,
      },
    };
  }
}
