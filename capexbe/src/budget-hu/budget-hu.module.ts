import { Module } from '@nestjs/common';
import { BudgetHuController } from './budget-hu.controller';
import { BudgetHuService } from './budget-hu.service';

@Module({
  controllers: [BudgetHuController],
  providers: [BudgetHuService],
})
export class BudgetHuModule {}
