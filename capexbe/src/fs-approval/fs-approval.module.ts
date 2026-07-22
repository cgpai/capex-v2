import { Module } from '@nestjs/common';
import { FsModule } from '../fs/fs.module';
import { FsApprovalController } from './fs-approval.controller';
import { FsApprovalService } from './fs-approval.service';

@Module({
  imports: [FsModule],
  controllers: [FsApprovalController],
  providers: [FsApprovalService],
})
export class FsApprovalModule {}
