import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { ExecutiveSummaryService } from './executive-summary.service';

@Controller('executive-summary')
export class ExecutiveSummaryController {
  constructor(private readonly executiveSummaryService: ExecutiveSummaryService) {}

  @Post('page-bundle')
  async pageBundle(@Req() req: Request, @Body() body: unknown) {
    return this.executiveSummaryService.loadPageBundle(requireAccessTokenFromRequest(req), body);
  }

  @Post('summary-stats')
  async summaryStats(@Req() req: Request, @Body() body: unknown) {
    return this.executiveSummaryService.loadStats(requireAccessTokenFromRequest(req), body);
  }

  @Post('projects-page')
  async projectsPage(@Req() req: Request, @Body() body: unknown) {
    return this.executiveSummaryService.loadProjectsPage(requireAccessTokenFromRequest(req), body);
  }

  @Post('dashboard-metrics')
  async dashboardMetrics(@Req() req: Request, @Body() body: unknown) {
    return this.executiveSummaryService.loadDashboardMetrics(requireAccessTokenFromRequest(req), body);
  }
}
