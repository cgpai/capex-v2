import { Module } from '@nestjs/common';
import { FsModule } from '../fs/fs.module';
import { FsRealizationController } from './fs-realization.controller';
import { FsRealizationService } from './fs-realization.service';

@Module({
  imports: [FsModule],
  controllers: [FsRealizationController],
  providers: [FsRealizationService],
})
export class FsRealizationModule {}
