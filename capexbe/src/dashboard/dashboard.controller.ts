import { Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { DashboardService } from './dashboard.service';

class DashboardBodyDto {
  periodName!: string;
  userId!: number;
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Post('snapshot')
  async snapshot(@Req() req: Request, @Body() body: DashboardBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    const userId = Number(body?.userId);
    if (!Number.isFinite(userId)) {
      throw new UnauthorizedException('Invalid userId');
    }
    return this.dashboardService.loadSnapshot(token, userId, body.periodName);
  }
}
