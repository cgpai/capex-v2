import { Body, Controller, Logger, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { ConfigurationService } from './configuration.service';

class ConfigurationPackBodyDto {
  userId!: number;
  slices?: string[];
  /** When true, bypass server memory/Redis cache for fresh admin reads. */
  skipCache?: boolean;
}

class ConfigurationSaveBodyDto {
  userId!: number;
  entity!: string;
  payload!: Record<string, unknown>;
}

class ConfigurationDeleteBodyDto {
  userId!: number;
  entity!: string;
  id!: string | number;
}

class MigrateAssetTypeWorkflowBodyDto {
  userId!: number;
  fromWorkflowSetId!: string;
  toWorkflowSetId!: string;
}

class AssetTypeUsageCountBodyDto {
  userId!: number;
  assetTypeId!: string;
}

class MigrateAssetTypeUsageBodyDto {
  userId!: number;
  fromAssetTypeId!: string;
  toAssetTypeId!: string;
}

class AppConfigGetBodyDto {
  userId!: number;
  key!: string;
}

@Controller('configuration')
export class ConfigurationController {
  private readonly logger = new Logger(ConfigurationController.name);
  constructor(private readonly configurationService: ConfigurationService) {}

  private parseUserId(body: { userId?: number }): number {
    const userId = Number(body?.userId);
    if (!Number.isFinite(userId)) {
      throw new UnauthorizedException('Invalid userId');
    }
    return userId;
  }

  @Post('pack')
  async configurationPack(@Req() req: Request, @Body() body: ConfigurationPackBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.configurationService.loadConfigurationPack(
      token,
      this.parseUserId(body),
      body?.slices,
      !!body?.skipCache,
    );
  }

  @Post('save')
  async configurationSave(@Req() req: Request, @Body() body: ConfigurationSaveBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    const userId = this.parseUserId(body);
    const entity = body?.entity as any;
    const payload = body?.payload || {};
    if (entity === 'user') {
      const assignments = Array.isArray((payload as any)?.assignments) ? (payload as any).assignments : [];
      this.logger.log(
        `[configuration/save] entity=user userId=${userId} targetId=${String((payload as any)?.id ?? '')} assignments=${assignments.length}`,
      );
    }
    const result = await this.configurationService.saveConfigurationEntity(token, userId, entity, payload);
    if (entity === 'user') {
      this.logger.log(`[configuration/save] entity=user success targetId=${String((payload as any)?.id ?? '')}`);
    }
    return result;
  }

  @Post('migrate-asset-type-workflow')
  async migrateAssetTypeWorkflow(@Req() req: Request, @Body() body: MigrateAssetTypeWorkflowBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.configurationService.migrateAssetTypeWorkflow(
      token,
      this.parseUserId(body),
      body.fromWorkflowSetId,
      body.toWorkflowSetId,
    );
  }

  @Post('asset-type-usage-count')
  async assetTypeUsageCount(@Req() req: Request, @Body() body: AssetTypeUsageCountBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.configurationService.getAssetTypeUsageCount(
      token,
      this.parseUserId(body),
      body.assetTypeId,
    );
  }

  @Post('migrate-asset-type-usage')
  async migrateAssetTypeUsage(@Req() req: Request, @Body() body: MigrateAssetTypeUsageBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.configurationService.migrateAssetTypeUsage(
      token,
      this.parseUserId(body),
      body.fromAssetTypeId,
      body.toAssetTypeId,
    );
  }

  @Post('delete')
  async configurationDelete(@Req() req: Request, @Body() body: ConfigurationDeleteBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.configurationService.deleteConfigurationEntity(
      token,
      this.parseUserId(body),
      body?.entity as any,
      body?.id,
    );
  }

  @Post('app-config-get')
  async appConfigGet(@Req() req: Request, @Body() body: AppConfigGetBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.configurationService.getAppConfigByKey(token, this.parseUserId(body), body.key);
  }
}
