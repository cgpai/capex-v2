import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { MonitoringService } from './monitoring.service';

@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Post('page-bundle')
  async pageBundle(@Req() req: Request, @Body() body: unknown) {
    return this.monitoringService.loadPageBundle(requireAccessTokenFromRequest(req), body);
  }

  @Post('users/query')
  async usersQuery(@Req() req: Request, @Body() body: unknown) {
    return this.monitoringService.loadUsersPage(requireAccessTokenFromRequest(req), body);
  }
}
