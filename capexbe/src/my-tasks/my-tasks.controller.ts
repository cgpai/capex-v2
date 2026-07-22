import { Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { MyTasksService } from './my-tasks.service';

class MyTasksBodyDto {
  userId!: number;
  /** When set, only assets in this budget period (aligned with Capex Project List). */
  periodName?: string;
  /** Bypass cache after task/status mutations. */
  skipCache?: boolean;
}

@Controller()
export class MyTasksController {
  constructor(private readonly myTasksService: MyTasksService) {}

  @Post('my-tasks')
  async myTasks(@Req() req: Request, @Body() body: MyTasksBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    const userId = Number(body?.userId);
    if (!Number.isFinite(userId)) {
      throw new UnauthorizedException('Invalid userId');
    }
    return this.myTasksService.loadMyTasks(token, userId, body.periodName, !!body.skipCache);
  }

  @Post('my-tasks/open-count')
  async openCount(@Req() req: Request, @Body() body: MyTasksBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    const userId = Number(body?.userId);
    if (!Number.isFinite(userId)) {
      throw new UnauthorizedException('Invalid userId');
    }
    return this.myTasksService.loadOpenTaskCount(token, userId, body.periodName);
  }
}
