import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { FsRealizationService } from './fs-realization.service';
import { runFsPageBundle } from '../fs/fs-page-bundle.util';

@Controller('fs-realization')
export class FsRealizationController {
  constructor(private readonly fsRealizationService: FsRealizationService) {}

  @Post('page-bundle')
  async pageBundle(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    return runFsPageBundle('fs-realization/page-bundle', () =>
      this.fsRealizationService.loadPageBundle(token, body),
    );
  }
}
