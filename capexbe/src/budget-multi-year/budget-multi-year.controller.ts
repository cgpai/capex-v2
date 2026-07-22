import { Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { requireAccessTokenFromRequest } from '../auth/request-access-token.util';
import { BudgetMultiYearService } from './budget-multi-year.service';

class BudgetMultiYearUserBodyDto {
  userId!: number;
}

class BudgetMultiYearPeriodBudgetsDto extends BudgetMultiYearUserBodyDto {
  multiYearName!: string;
}

class BudgetMultiYearSaveDto extends BudgetMultiYearUserBodyDto {
  multiYear!: Record<string, unknown>;
}

class BudgetMultiYearCreatePeriodDto extends BudgetMultiYearUserBodyDto {
  periodName!: string;
  startDate!: string;
  endDate!: string;
  multiYearName!: string;
}

class BudgetMultiYearSavePeriodDto extends BudgetMultiYearUserBodyDto {
  period!: Record<string, unknown>;
  categoryIds?: string[];
}

class BudgetMultiYearSaveArchetypePlansDto extends BudgetMultiYearUserBodyDto {
  periodName!: string;
  rows!: Array<{ archetypeId: string; categoryId: string; budgetPlan: number }>;
}

class BudgetMultiYearSaveHuPlansDto extends BudgetMultiYearUserBodyDto {
  periodName!: string;
  rows!: Array<{ hospitalUnitId: string; categoryId: string; budgetPlan: number }>;
}

@Controller('budget-multi-year')
export class BudgetMultiYearController {
  constructor(private readonly budgetMultiYearService: BudgetMultiYearService) {}

  private parseUserId(body: { userId?: number }): number {
    const userId = Number(body?.userId);
    if (!Number.isFinite(userId)) {
      throw new UnauthorizedException('Invalid userId');
    }
    return userId;
  }

  @Post('page-bundle')
  async pageBundle(@Req() req: Request, @Body() body: BudgetMultiYearUserBodyDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetMultiYearService.loadPageBundle(token, this.parseUserId(body));
  }

  @Post('period-budgets')
  async periodBudgets(@Req() req: Request, @Body() body: BudgetMultiYearPeriodBudgetsDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetMultiYearService.loadPeriodBudgets(
      token,
      this.parseUserId(body),
      body.multiYearName,
    );
  }

  @Post('save-multi-year')
  async saveMultiYear(@Req() req: Request, @Body() body: BudgetMultiYearSaveDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetMultiYearService.saveMultiYear(
      token,
      this.parseUserId(body),
      body.multiYear ?? {},
    );
  }

  @Post('create-period')
  async createPeriod(@Req() req: Request, @Body() body: BudgetMultiYearCreatePeriodDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetMultiYearService.createPeriod(token, this.parseUserId(body), body);
  }

  @Post('save-period-plans')
  async savePeriodPlans(@Req() req: Request, @Body() body: BudgetMultiYearSavePeriodDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetMultiYearService.savePeriodCategoryPlans(
      token,
      this.parseUserId(body),
      body.period ?? {},
      body.categoryIds,
    );
  }

  @Post('save-archetype-plans')
  async saveArchetypePlans(@Req() req: Request, @Body() body: BudgetMultiYearSaveArchetypePlansDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetMultiYearService.saveArchetypeBudgetPlans(
      token,
      this.parseUserId(body),
      body.periodName,
      body.rows ?? [],
    );
  }

  @Post('save-hu-plans')
  async saveHuPlans(@Req() req: Request, @Body() body: BudgetMultiYearSaveHuPlansDto) {
    const token = requireAccessTokenFromRequest(req);
    return this.budgetMultiYearService.saveHuBudgetPlans(
      token,
      this.parseUserId(body),
      body.periodName,
      body.rows ?? [],
    );
  }
}
