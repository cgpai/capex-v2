import { Module } from '@nestjs/common';
import { BudgetMultiYearController } from './budget-multi-year.controller';
import { BudgetMultiYearService } from './budget-multi-year.service';

@Module({
  controllers: [BudgetMultiYearController],
  providers: [BudgetMultiYearService],
})
export class BudgetMultiYearModule {}
