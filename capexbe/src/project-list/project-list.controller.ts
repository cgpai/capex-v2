import { Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { ProjectListService } from './project-list.service';

class ProjectListBodyDto {
  periodName!: string;
  userId!: number;
  /** When true, bypass server memory cache (use after task/status updates). */
  skipCache?: boolean;
  /** Halaman aset (1-based). Jika diisi bersama `pageSize`, BE hanya memuat slice aset + status/log untuk slice itu (lazy). */
  page?: number;
  pageSize?: number;
}

@Controller()
export class ProjectListController {
  constructor(private readonly projectListService: ProjectListService) {}

  @Post('project-list')
  async projectList(@Req() req: Request, @Body() body: ProjectListBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    const userId = Number(body?.userId);
    if (!Number.isFinite(userId)) {
      throw new UnauthorizedException('Invalid userId');
    }
    return this.projectListService.loadBundle(token, userId, body.periodName, !!body.skipCache, {
      page: body.page,
      pageSize: body.pageSize,
    });
  }

  /** Master config (workflows, users, roles, …) — separate from paginated table rows. */
  @Post('project-list/master')
  async projectListMaster(@Req() req: Request, @Body() body: { userId?: number }) {
    const token = requireAccessTokenFromRequest(req);
    const userId = Number(body?.userId);
    if (!Number.isFinite(userId)) {
      throw new UnauthorizedException('Invalid userId');
    }
    return this.projectListService.loadMasterBundle(token, userId);
  }

  /** Server-side search, filter, and pagination — source of truth for Capex Project List table. */
  @Post('project-list/query')
  async projectListQuery(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    return this.projectListService.loadQueryPage(token, body);
  }

  /** Alias for screen page-bundle prefetch (same handler as query). */
  @Post('project-list/page-bundle')
  async projectListPageBundle(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    return this.projectListService.loadQueryPage(token, body);
  }

  /** Server-side export — returns all matching rows (bounded) without client fetch-all loops. */
  @Post('project-list/export')
  async projectListExport(@Req() req: Request, @Body() body: unknown) {
    const token = requireAccessTokenFromRequest(req);
    return this.projectListService.loadExport(token, body);
  }
}
