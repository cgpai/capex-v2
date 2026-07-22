import { Module } from '@nestjs/common';
import { AssetTimelineController } from './asset-timeline.controller';
import { AssetTimelineService } from './asset-timeline.service';

@Module({
  controllers: [AssetTimelineController],
  providers: [AssetTimelineService],
})
export class AssetTimelineModule {}
