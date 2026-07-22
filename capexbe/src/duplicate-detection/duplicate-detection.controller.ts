import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { DuplicateDetectionService } from './duplicate-detection.service';

@Controller('duplicate-detection')
export class DuplicateDetectionController {
  constructor(private readonly duplicateDetection: DuplicateDetectionService) {}

  @Post('projects/search')
  searchProjects(@Req() req: Request, @Body() body: unknown) {
    return this.duplicateDetection.searchProjects(requireAccessTokenFromRequest(req), body);
  }

  @Post('assets/search')
  searchAssets(@Req() req: Request, @Body() body: unknown) {
    return this.duplicateDetection.searchAssets(requireAccessTokenFromRequest(req), body);
  }

  @Post('project')
  fetchProject(@Req() req: Request, @Body() body: unknown) {
    return this.duplicateDetection.fetchProject(requireAccessTokenFromRequest(req), body);
  }

  @Post('asset')
  fetchAsset(@Req() req: Request, @Body() body: unknown) {
    return this.duplicateDetection.fetchAsset(requireAccessTokenFromRequest(req), body);
  }
}
