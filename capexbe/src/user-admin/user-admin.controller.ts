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
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { UserAdminService } from './user-admin.service';

/** Multer in-memory upload (no @types/multer required). */
type UploadedMemoryFile = { buffer: Buffer; originalname: string };

class BulkDeleteBodyDto {
  userId!: number;
  ids!: number[];
}

@Controller('user-admin')
export class UserAdminController {
  constructor(private readonly userAdminService: UserAdminService) {}

  @Post('office-list-diff')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async officeListDiff(
    @Req() req: Request,
    @UploadedFile() file: UploadedMemoryFile | undefined,
    @Body('userId') userIdRaw: string | undefined,
  ) {
    const token = requireAccessTokenFromRequest(req);
    const appUserId = Number(userIdRaw);
    if (!Number.isFinite(appUserId)) {
      throw new BadRequestException('Invalid or missing userId (form field)');
    }
    if (!file?.buffer) {
      throw new BadRequestException('Missing file (form field "file")');
    }
    return this.userAdminService.compareOfficeList(token, appUserId, {
      buffer: file.buffer,
      originalname: file.originalname || 'upload',
    });
  }

  @Post('bulk-delete')
  async bulkDelete(@Req() req: Request, @Body() body: BulkDeleteBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    const appUserId = Number(body?.userId);
    if (!Number.isFinite(appUserId)) {
      throw new BadRequestException('Invalid userId');
    }
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    return this.userAdminService.bulkDeleteUsers(token, appUserId, ids);
  }

  @Post('sync-to-auth')
  async syncToAuth(@Req() req: Request, @Body() body: BulkDeleteBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    const appUserId = Number(body?.userId);
    if (!Number.isFinite(appUserId)) {
      throw new BadRequestException('Invalid userId');
    }
    return this.userAdminService.syncUsersToAuth(token, appUserId);
  }
}
