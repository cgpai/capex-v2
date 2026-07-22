import { Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { BootstrapService } from './bootstrap.service';

class BootstrapBodyDto {
  userId!: number;
}

@Controller('bootstrap')
export class BootstrapController {
  constructor(private readonly bootstrapService: BootstrapService) {}

  @Post()
  async bootstrap(@Req() req: Request, @Body() body: BootstrapBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    const userId = Number(body?.userId);
    if (!Number.isFinite(userId)) {
      throw new UnauthorizedException('Invalid userId');
    }
    return this.bootstrapService.loadAppInitPack(token, userId);
  }
}
