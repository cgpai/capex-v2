import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GrUpdateController } from './gr-update.controller';
import { GrUpdateService } from './gr-update.service';

@Module({
  imports: [AuthModule],
  controllers: [GrUpdateController],
  providers: [GrUpdateService],
})
export class GrUpdateModule {}
