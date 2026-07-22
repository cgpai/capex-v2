import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { FsService } from './fs.service';
import {
  parseFsIdBody,
  parseFsIdParam,
  parseFsIdWithUpdatesBody,
  parseUserIdBody,
  validateFsCreatePayload,
  validateFsRealizationPayload,
} from './fs.dto';

@Controller('fs')
export class FsController {
  constructor(private readonly fsService: FsService) {}

  @Post('feasibility-studies/list')
  async listStudies(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    const userId = parseUserIdBody(body);
    return this.fsService.listFeasibilityStudies(token, userId);
  }

  @Post('feasibility-studies/get')
  async getStudy(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    const { userId, id } = parseFsIdBody(body);
    return this.fsService.getFeasibilityStudyById(token, userId, id);
  }

  @Post('feasibility-studies/create')
  async createStudy(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    const b = (body ?? {}) as Record<string, unknown>;
    const userId = parseUserIdBody(body);
    const payload = validateFsCreatePayload(b.payload ?? {});
    return this.fsService.createFeasibilityStudy(token, userId, payload);
  }

  @Post('feasibility-studies/update')
  async updateStudy(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    const { userId, id, updates } = parseFsIdWithUpdatesBody(body);
    return this.fsService.updateFeasibilityStudy(token, userId, id, updates);
  }

  @Post('realizations/list')
  async listRealizations(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    const { userId, fsId } = parseFsIdParam(body);
    return this.fsService.listRealizations(token, userId, fsId);
  }

  @Post('realizations/save')
  async saveRealization(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    const b = (body ?? {}) as Record<string, unknown>;
    const userId = parseUserIdBody(body);
    const payload = validateFsRealizationPayload(b.payload ?? {});
    return this.fsService.saveRealization(token, userId, payload);
  }
}
