import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { PoUpdateService } from './po-update.service';

@Controller('po-update')
export class PoUpdateController {
  constructor(private readonly poUpdateService: PoUpdateService) {}

  @Post('page-bundle')
  async pageBundle(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    return this.poUpdateService.loadPageBundle(token, body);
  }

  @Post('save')
  async save(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    return this.poUpdateService.saveAssets(token, body);
  }
}
