import { Module } from '@nestjs/common';
import { MyTasksController } from './my-tasks.controller';
import { MyTasksService } from './my-tasks.service';

@Module({
  controllers: [MyTasksController],
  providers: [MyTasksService],
})
export class MyTasksModule {}
