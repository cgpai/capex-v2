import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DuplicateDetectionController } from './duplicate-detection.controller';
import { DuplicateDetectionService } from './duplicate-detection.service';

@Module({
  imports: [AuthModule],
  controllers: [DuplicateDetectionController],
  providers: [DuplicateDetectionService],
  exports: [DuplicateDetectionService],
})
export class DuplicateDetectionModule {}
