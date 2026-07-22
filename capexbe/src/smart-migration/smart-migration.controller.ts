import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { getAccessTokenFromRequest } from '../auth/request-access-token.util';
import { SmartMigrationService } from './smart-migration.service';
import type { SmartMigrationMeta } from './smart-migration.types';

@Controller('smart-migration')
export class SmartMigrationController {
  constructor(private readonly smartMigrationService: SmartMigrationService) {}

  @Post('execute')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 35 * 1024 * 1024 },
    }),
  )
  async execute(
    @Req() req: Request,
    @Body('meta') metaJson: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Berkas Excel (field file) wajib diunggah.');
    }
    let meta: SmartMigrationMeta;
    try {
      meta = JSON.parse(metaJson || '{}') as SmartMigrationMeta;
    } catch {
      throw new BadRequestException('Field meta harus berisi JSON valid.');
    }
    const authHeader = getAccessTokenFromRequest(req);
    return this.smartMigrationService.execute(
      authHeader ? `Bearer ${authHeader}` : '',
      file.buffer,
      meta,
      file.originalname || 'migration.xlsx',
    );
  }

  @Post('progress')
  async progress(
    @Req() req: Request,
    @Body() body: { userId?: number; jobId?: string },
  ) {
    const authHeader = getAccessTokenFromRequest(req);
    const userId = Number(body?.userId);
    const jobId = typeof body?.jobId === 'string' ? body.jobId : '';
    const progress = await this.smartMigrationService.getProgress(
      authHeader ? `Bearer ${authHeader}` : '',
      userId,
      jobId,
    );
    return progress ?? { stage: 'preparing', processedRows: 0, totalRows: 0, message: 'Menunggu migrasi…' };
  }
}
