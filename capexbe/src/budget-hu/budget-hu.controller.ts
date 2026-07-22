import { Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { BudgetHuService } from './budget-hu.service';

class BudgetHuBundleBodyDto {
  periodName!: string;
  userId!: number;
  skipCache?: boolean;
  /** Scope project/asset hydration to one HU (fast Budget HU page). */
  hospitalUnitId?: string;
  /** Skip master config in payload when FE already has config query. */
  omitConfig?: boolean;
}

class BudgetHuInvalidateBodyDto {
  periodName!: string;
  userId!: number;
}

class BudgetHuSaveBodyDto {
  periodName!: string;
  userId!: number;
  budgetPeriod!: Record<string, unknown>;
  partial?: boolean;
  huId?: string;
  changedProjectIds?: string[];
  deletedProjectIds?: string[];
  touchedAssetIds?: string[];
  projectsOnly?: boolean;
}

class BudgetHuAllocateProjectCodeDto {
  userId!: number;
  periodName!: string;
  huCode!: string;
  preferredCode?: string;
  excludeProjectId?: string;
}

class BudgetHuAllocateAssetCodeDto {
  userId!: number;
  projectCode!: string;
  preferredCode?: string;
  excludeAssetId?: string;
}

class BudgetHuSyncStampDto {
  userId!: number;
  periodName!: string;
  hospitalUnitId!: string;
}

class BudgetHuSaveProjectDto {
  userId!: number;
  periodName!: string;
  project!: Record<string, unknown>;
}

class BudgetHuSaveAssetDto {
  userId!: number;
  periodName!: string;
  asset!: Record<string, unknown>;
}

class BudgetHuSavePurchaseOrderDto {
  userId!: number;
  periodName!: string;
  purchaseOrder!: Record<string, unknown>;
  action?: 'create' | 'update';
}

class BudgetHuPurchaseOrderGetDto {
  userId!: number;
  poId!: string;
}

class BudgetHuPurchaseOrdersForProjectDto {
  userId!: number;
  projectId!: string;
}

class BudgetHuProjectsForPeriodDto {
  userId!: number;
  periodName!: string;
}

@Controller('budget-hu')
export class BudgetHuController {
  constructor(private readonly budgetHuService: BudgetHuService) {}

  private parseUserId(body: { userId?: number }): number {
    const userId = Number(body?.userId);
    if (!Number.isFinite(userId)) {
      throw new UnauthorizedException('Invalid userId');
    }
    return userId;
  }

  @Post('page-bundle')
  async pageBundle(@Req() req: Request, @Body() body: BudgetHuBundleBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.loadPageBundle(
      token,
      this.parseUserId(body),
      body.periodName,
      !!body.skipCache,
      {
        hospitalUnitId: body.hospitalUnitId,
        omitConfig: !!body.omitConfig,
      },
    );
  }

  @Post('period')
  async periodOnly(@Req() req: Request, @Body() body: BudgetHuBundleBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.loadBudgetPeriodOnly(
      token,
      this.parseUserId(body),
      body.periodName,
      !!body.skipCache,
    );
  }

  @Post('config-bundle')
  async configBundle(@Req() req: Request, @Body() body: BudgetHuBundleBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.loadConfigBundle(token, this.parseUserId(body), !!body.skipCache);
  }

  @Post('project-asset-counts')
  async projectAssetCounts(@Req() req: Request, @Body() body: BudgetHuBundleBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.loadProjectAssetCounts(
      token,
      this.parseUserId(body),
      body.periodName,
      !!body.skipCache,
    );
  }

  @Post('invalidate-cache')
  async invalidateCache(@Req() req: Request, @Body() body: BudgetHuInvalidateBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    await this.budgetHuService.invalidateForPeriod(
      token,
      this.parseUserId(body),
      body.periodName,
    );
    return { ok: true };
  }

  @Post('allocate-project-code')
  async allocateProjectCode(@Req() req: Request, @Body() body: BudgetHuAllocateProjectCodeDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.allocateProjectCode(token, this.parseUserId(body), body);
  }

  @Post('allocate-asset-code')
  async allocateAssetCode(@Req() req: Request, @Body() body: BudgetHuAllocateAssetCodeDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.allocateAssetCode(token, this.parseUserId(body), body);
  }

  /** Lightweight peer-change detector — uncached; polled while Budget HU is open. */
  @Post('hu-sync-stamp')
  async huSyncStamp(@Req() req: Request, @Body() body: BudgetHuSyncStampDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.getHuSyncStamp(
      token,
      this.parseUserId(body),
      body.periodName,
      body.hospitalUnitId,
    );
  }

  @Post('save')
  async save(@Req() req: Request, @Body() body: BudgetHuSaveBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.savePeriod(token, this.parseUserId(body), body);
  }

  @Post('save-period')
  async savePeriod(@Req() req: Request, @Body() body: BudgetHuSaveBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.savePeriod(token, this.parseUserId(body), body);
  }

  @Post('save-project')
  async saveProject(@Req() req: Request, @Body() body: BudgetHuSaveProjectDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.saveSingleProject(
      token,
      this.parseUserId(body),
      body.periodName,
      body.project ?? {},
    );
  }

  @Post('save-asset')
  async saveAsset(@Req() req: Request, @Body() body: BudgetHuSaveAssetDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.saveSingleAsset(
      token,
      this.parseUserId(body),
      body.periodName,
      body.asset ?? {},
    );
  }

  @Post('save-purchase-order')
  async savePurchaseOrder(@Req() req: Request, @Body() body: BudgetHuSavePurchaseOrderDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.savePurchaseOrder(
      token,
      this.parseUserId(body),
      body.periodName,
      body.purchaseOrder ?? {},
      body.action === 'update' ? 'update' : 'create',
    );
  }

  @Post('purchase-order/get')
  async getPurchaseOrder(@Req() req: Request, @Body() body: BudgetHuPurchaseOrderGetDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.getPurchaseOrder(token, this.parseUserId(body), body.poId);
  }

  @Post('purchase-orders/for-project')
  async getPurchaseOrdersForProject(
    @Req() req: Request,
    @Body() body: BudgetHuPurchaseOrdersForProjectDto,
  ) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.getPurchaseOrdersForProject(
      token,
      this.parseUserId(body),
      body.projectId,
    );
  }

  @Post('projects-for-period')
  async projectsForPeriod(@Req() req: Request, @Body() body: BudgetHuProjectsForPeriodDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetHuService.loadProjectsForPeriod(
      token,
      this.parseUserId(body),
      body.periodName,
    );
  }
}
