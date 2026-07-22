import { Module } from '@nestjs/common';
import { SmartMigrationController } from './smart-migration.controller';
import { SmartMigrationService } from './smart-migration.service';

@Module({
  controllers: [SmartMigrationController],
  providers: [SmartMigrationService],
})
export class SmartMigrationModule {}
