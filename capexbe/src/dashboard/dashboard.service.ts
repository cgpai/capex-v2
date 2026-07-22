import { Injectable, BadRequestException } from '@nestjs/common';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthZService } from '../auth/auth-z.service';
import {
  fetchAllRecordsWhereEq,
  fetchRecordsInBatches,
} from '../project-list/supabase-helpers';
import { loadProjectMetricsForPeriod } from '../project-list/project-metrics.loader';
const DONUT_COLORS = ['#28A745', '#FFC107', '#DC3545'];

export type DashboardSnapshotDto = {
  totalBudget: number;
  totalConsumed: number;
  projectCount: number;
  projectStatusData: { name: string; value: number; color: string }[];
  budgetByCategory: { name: string; approved: number; consumed: number }[];
  sankeyData: { source: string; target: string; value: number }[];
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly authZ: AuthZService,
  ) {}

  async loadSnapshot(accessToken: string, userId: number, periodName: string): Promise<DashboardSnapshotDto> {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Dashboard', 'view');
    if (!periodName?.trim()) {
      throw new BadRequestException('periodName is required');
    }

    const { client } = await this.authContext.getRlsClient(accessToken, userId);

    const pn = periodName.trim();

    const [catRows, archBudgetRows, huBudgetRows, projectMetrics] = await Promise.all([
      fetchAllRecordsWhereEq(client, 'budget_period_category_budgets', 'period_name', pn),
      fetchAllRecordsWhereEq(client, 'budget_period_archetype_budgets', 'period_name', pn).catch(() => []),
      fetchAllRecordsWhereEq(client, 'budget_period_hospital_unit_budgets', 'period_name', pn).catch(() => []),
      loadProjectMetricsForPeriod(client, pn),
    ]);

    const categoryIds = [
      ...new Set(catRows.map((cb: any) => String(cb.budget_category_id ?? '')).filter(Boolean)),
    ];
    const archIds = [
      ...new Set(archBudgetRows.map((r: any) => String(r.archetype_id ?? '')).filter(Boolean)),
    ];
    const huIds = [
      ...new Set(huBudgetRows.map((r: any) => String(r.hospital_unit_id ?? '')).filter(Boolean)),
    ];

    const [catCfgs, archetypes, hus] = await Promise.all([
      categoryIds.length
        ? fetchRecordsInBatches(client, 'budget_category_configs', 'id', categoryIds, 'id, name')
        : Promise.resolve([]),
      archIds.length
        ? fetchRecordsInBatches(client, 'archetypes_config', 'id', archIds, 'id, name')
        : Promise.resolve([]),
      huIds.length
        ? fetchRecordsInBatches(
            client,
            'hospital_units_config',
            'id',
            huIds,
            'id, name, archetype_id',
          )
        : Promise.resolve([]),
    ]);

    const categoryNameById = new Map<string, string>();
    catCfgs.forEach((c: any) => {
      categoryNameById.set(String(c.id), String(c.name ?? ''));
    });

    let totalBudget = 0;
    let totalConsumed = 0;
    catRows.forEach((cb: any) => {
      totalBudget += Number(cb.budget_plan || 0) + Number(cb.budget_carry_forward || 0);
      totalConsumed += Number(cb.consumed_budget || 0);
    });

    const budgetByCategory = catRows
      .map((cb: any) => ({
        name: categoryNameById.get(String(cb.budget_category_id)) || 'Unknown',
        approved: Number(cb.approved_budget || 0),
        consumed: Number(cb.consumed_budget || 0),
      }))
      .filter((b) => b.approved > 0 || b.consumed > 0);

    const statusCounts = projectMetrics.statusCounts;

    const projectStatusData = [
      { name: 'On Track', value: statusCounts.OnTrack, color: DONUT_COLORS[0] },
      { name: 'At Risk', value: statusCounts.AtRisk, color: DONUT_COLORS[1] },
      { name: 'Off Track', value: statusCounts.OffTrack, color: DONUT_COLORS[2] },
    ];

    const totalBudgetPlanTop = catRows.reduce((s: number, cb: any) => s + Number(cb.budget_plan || 0), 0);

    const sankeyData: { source: string; target: string; value: number }[] = [];
    if (totalBudgetPlanTop > 0) {
      sankeyData.push({ source: 'Siloam Overall', target: 'Total Budget', value: totalBudgetPlanTop });
    }

    const archNameById = new Map<string, string>();
    archetypes.forEach((a: any) => archNameById.set(String(a.id), String(a.name ?? '')));

    const archTotals = new Map<string, number>();
    archBudgetRows.forEach((row: any) => {
      const aid = String(row.archetype_id ?? '');
      const v = Number(row.budget_plan || 0);
      archTotals.set(aid, (archTotals.get(aid) || 0) + v);
    });

    const huTotals = new Map<string, number>();
    huBudgetRows.forEach((row: any) => {
      const hid = String(row.hospital_unit_id ?? '');
      const v = Number(row.budget_plan || 0);
      huTotals.set(hid, (huTotals.get(hid) || 0) + v);
    });

    archTotals.forEach((val, archId) => {
      if (val > 0) {
        const name = archNameById.get(archId) || archId;
        sankeyData.push({ source: 'Total Budget', target: name, value: val });
      }
    });

    const huByArch = new Map<string, { id: string; name: string }[]>();
    hus.forEach((hu: any) => {
      const aid = String(hu.archetype_id ?? '');
      if (!huByArch.has(aid)) huByArch.set(aid, []);
      huByArch.get(aid)!.push({ id: String(hu.id), name: String(hu.name ?? '') });
    });

    archTotals.forEach((_val, archId) => {
      const archName = archNameById.get(archId) || archId;
      const units = huByArch.get(archId) || [];
      units.forEach((hu) => {
        const hv = huTotals.get(hu.id) || 0;
        if (hv > 0) {
          sankeyData.push({ source: archName, target: hu.name, value: hv });
        }
      });
    });

    return {
      totalBudget,
      totalConsumed,
      projectCount: projectMetrics.projectCount,
      projectStatusData,
      budgetByCategory,
      sankeyData,
    };
  }
}
