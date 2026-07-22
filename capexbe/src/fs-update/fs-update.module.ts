import { Module } from '@nestjs/common';
import { FsUpdateController } from './fs-update.controller';
import { FsUpdateService } from './fs-update.service';
import { FsModule } from '../fs/fs.module';

@Module({
  imports: [FsModule],
  controllers: [FsUpdateController],
  providers: [FsUpdateService],
})
export class FsUpdateModule {}
