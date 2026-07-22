import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { FsUpdateService } from './fs-update.service';
import { runFsPageBundle } from '../fs/fs-page-bundle.util';

@Controller('fs-update')
export class FsUpdateController {
  constructor(private readonly fsUpdateService: FsUpdateService) {}

  @Post('page-bundle')
  async pageBundle(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    return runFsPageBundle('fs-update/page-bundle', () =>
      this.fsUpdateService.loadPageBundle(token, body),
    );
  }

  @Post('save')
  async save(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    return this.fsUpdateService.saveProjects(token, body);
  }
}
