import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PoUpdateController } from './po-update.controller';
import { PoUpdateService } from './po-update.service';

@Module({
  imports: [AuthModule],
  controllers: [PoUpdateController],
  providers: [PoUpdateService],
})
export class PoUpdateModule {}
