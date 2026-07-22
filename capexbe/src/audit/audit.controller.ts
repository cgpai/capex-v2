import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Post('list-for-entity')
  listForEntity(@Req() req: Request, @Body() body: unknown) {
    return this.auditService.listForEntity(requireAccessTokenFromRequest(req), body);
  }

  @Post('save-batch')
  saveBatch(@Req() req: Request, @Body() body: unknown) {
    return this.auditService.saveBatch(requireAccessTokenFromRequest(req), body);
  }
}
