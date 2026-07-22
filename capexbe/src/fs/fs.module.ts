import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FsController } from './fs.controller';
import { FsService } from './fs.service';
import { FsAuthService } from './fs-auth.service';

@Module({
  imports: [AuthModule],
  controllers: [FsController],
  providers: [FsService, FsAuthService],
  exports: [FsService, FsAuthService],
})
export class FsModule {}
