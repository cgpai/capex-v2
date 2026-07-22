import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MomDailySummaryController } from './mom-daily-summary.controller';
import { MomDailySummaryService } from './mom-daily-summary.service';

@Module({
  imports: [AuthModule],
  controllers: [MomDailySummaryController],
  providers: [MomDailySummaryService],
})
export class MomDailySummaryModule {}
