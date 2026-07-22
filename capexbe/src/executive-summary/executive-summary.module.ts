import { Module } from '@nestjs/common';
import { FsModule } from '../fs/fs.module';
import { ExecutiveSummaryController } from './executive-summary.controller';
import { ExecutiveSummaryService } from './executive-summary.service';

@Module({
  imports: [FsModule],
  controllers: [ExecutiveSummaryController],
  providers: [ExecutiveSummaryService],
})
export class ExecutiveSummaryModule {}
