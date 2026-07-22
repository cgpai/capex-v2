import { Module } from '@nestjs/common';
import { ProjectListModule } from '../project-list/project-list.module';
import { TaskActionsController } from './task-actions.controller';
import { TaskActionsService } from './task-actions.service';

@Module({
  imports: [ProjectListModule],
  controllers: [TaskActionsController],
  providers: [TaskActionsService],
})
export class TaskActionsModule {}
