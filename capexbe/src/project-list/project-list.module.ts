import { Module } from '@nestjs/common';
import { ProjectListController } from './project-list.controller';
import { ProjectListService } from './project-list.service';
import { ProjectListCacheService } from './project-list-cache.service';

@Module({
  controllers: [ProjectListController],
  providers: [ProjectListService, ProjectListCacheService],
  exports: [ProjectListService, ProjectListCacheService],
})
export class ProjectListModule {}
