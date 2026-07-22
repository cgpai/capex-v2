import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { TaskActionsService } from './task-actions.service';

class CompleteWorkflowDto {
  userId!: number;
  assetId!: string;
  taskId!: string;
  remark!: string;
  roleId!: number;
}

class CompleteAdhocDto {
  userId!: number;
  adhocTaskId!: string;
  remark!: string;
}

class AssetTaskDto {
  userId!: number;
  assetId!: string;
  taskId!: string;
}

class UpdateRemarkDto {
  userId!: number;
  assetId!: string;
  taskId!: string;
  remark!: string;
}

class UpsertFsApprovalDto {
  userId!: number;
  projectId!: string;
  conclusion!: string;
  amount?: number;
  followUpAction?: string | null;
  fsType?: string;
}

@Controller('task-actions')
export class TaskActionsController {
  constructor(private readonly taskActionsService: TaskActionsService) {}

  @Post('complete-workflow')
  async completeWorkflow(@Req() req: Request, @Body() body: CompleteWorkflowDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.completeWorkflow(token, body);
  }

  @Post('complete-adhoc')
  async completeAdhoc(@Req() req: Request, @Body() body: CompleteAdhocDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.completeAdhoc(token, body);
  }

  @Post('revert-to-open')
  async revertToOpen(@Req() req: Request, @Body() body: AssetTaskDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.revertToOpen(token, body);
  }

  @Post('report-not-yet-done')
  async reportNotYetDone(@Req() req: Request, @Body() body: AssetTaskDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.reportNotYetDone(token, body);
  }

  @Post('withdraw-report')
  async withdrawReport(@Req() req: Request, @Body() body: AssetTaskDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.withdrawReport(token, body);
  }

  @Post('update-remark')
  async updateRemark(@Req() req: Request, @Body() body: UpdateRemarkDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.updateRemark(token, body);
  }

  @Post('upsert-fs-approval')
  async upsertFsApproval(@Req() req: Request, @Body() body: UpsertFsApprovalDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.upsertFsApproval(token, body);
  }

  @Post('recalculate-asset')
  async recalculateAsset(@Req() req: Request, @Body() body: AssetTaskDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.recalculateAsset(token, body);
  }

  @Post('save-mom')
  async saveMom(@Req() req: Request, @Body() body: { userId: number; mom: Record<string, unknown> }) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.saveMom(token, body);
  }

  @Post('save-adhoc')
  async saveAdhoc(@Req() req: Request, @Body() body: { userId: number; task: Record<string, unknown> }) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.saveAdhocTask(token, body);
  }

  @Post('reschedule')
  async reschedule(@Req() req: Request, @Body() body: AssetTaskDto & { days: number; reason: string }) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.rescheduleTask(token, body);
  }

  @Post('update-sla-override')
  async updateSlaOverride(
    @Req() req: Request,
    @Body() body: AssetTaskDto & { slaDays: number | null },
  ) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.updateSlaOverride(token, body);
  }

  @Post('trigger-system')
  async triggerSystem(
    @Req() req: Request,
    @Body() body: { userId: number; assetId: string; triggerEvent: string; completedAt?: string },
  ) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.triggerSystemTask(token, body);
  }

  @Post('trigger-system-batch')
  async triggerSystemBatch(
    @Req() req: Request,
    @Body() body: { userId: number; assetIds: string[]; triggerEvent: string },
  ) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.triggerSystemTaskBatch(token, body);
  }

  @Post('asset-task-statuses-for-asset')
  async assetTaskStatusesForAsset(
    @Req() req: Request,
    @Body() body: { userId: number; assetId: string },
  ) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.getAssetTaskStatusesForAsset(token, body);
  }

  @Post('task-logs-for-asset')
  async taskLogsForAsset(
    @Req() req: Request,
    @Body() body: { userId: number; assetId: string },
  ) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.getTaskLogsForAsset(token, body);
  }

  @Post('moms-for-asset')
  async momsForAsset(
    @Req() req: Request,
    @Body() body: { userId: number; assetId: string },
  ) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.getMomsForAsset(token, body);
  }

  @Post('task-logs-for-asset-ids')
  async taskLogsForAssetIds(
    @Req() req: Request,
    @Body() body: { userId: number; assetIds: string[] },
  ) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.getTaskLogsForAssetIds(token, body);
  }

  @Post('asset-task-statuses-for-asset-ids')
  async assetTaskStatusesForAssetIds(
    @Req() req: Request,
    @Body() body: { userId: number; assetIds: string[] },
  ) {
    const token = requireAccessTokenFromRequest(req);
    return this.taskActionsService.getAssetTaskStatusesForAssetIds(token, body);
  }
}
