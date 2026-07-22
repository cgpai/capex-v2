import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { fetchAllRecords, toCamelCase } from '../project-list/supabase-helpers';
import { AuthZService } from '../auth/auth-z.service';
import { FsAuthService } from './fs-auth.service';
import type { FsCreatePayload, FsRealizationPayload, FsUpdatePayload } from './fs.dto';

const FS_STUDY_COLUMNS =
  'id,project_id,fs_type,amount,irr,payback_period,npv,roi,planned_revenue_start_date,actual_revenue_start_date,monthly_revenue_plan,throughput,conclusion,follow_up_action,created_at,updated_at';
const FS_REALIZATION_COLUMNS =
  'id,fs_id,month,actual_revenue,actual_throughput,notes,created_at,updated_at';

@Injectable()
export class FsService {
  constructor(
    private readonly fsAuth: FsAuthService,
    private readonly authZ: AuthZService,
  ) {}

  async listFeasibilityStudies(accessToken: string, userId: number) {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'FS Update', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const rows = await fetchAllRecords(client, 'feasibility_studies', FS_STUDY_COLUMNS);
    return { studies: rows ? rows.map(toCamelCase) : [] };
  }

  async getFeasibilityStudyById(accessToken: string, userId: number, id: string) {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'FS Update', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const { data, error } = await client
      .from('feasibility_studies')
      .select(FS_STUDY_COLUMNS)
      .eq('id', id.trim())
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException(`Feasibility study not found: ${id}`);
    return toCamelCase(data);
  }

  async createFeasibilityStudy(accessToken: string, userId: number, payload: FsCreatePayload) {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'FS Update', 'create');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const id = payload.id || `FS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const row = {
      id,
      project_id: payload.projectId,
      fs_type: payload.fsType,
      amount: payload.amount,
      irr: payload.irr,
      payback_period: payload.paybackPeriod,
      npv: payload.npv,
      roi: payload.roi,
      planned_revenue_start_date: payload.plannedRevenueStartDate,
      actual_revenue_start_date: payload.actualRevenueStartDate ?? null,
      monthly_revenue_plan: payload.monthlyRevenuePlan,
      throughput: payload.throughput ?? 0,
      conclusion: payload.conclusion ?? 'Pending',
      follow_up_action: payload.followUpAction ?? null,
      created_at: now,
      updated_at: now,
    };
    const { data, error } = await client.from('feasibility_studies').insert(row).select(FS_STUDY_COLUMNS).single();
    if (error) throw new BadRequestException(error.message);
    return toCamelCase(data);
  }

  async updateFeasibilityStudy(
    accessToken: string,
    userId: number,
    id: string,
    updates: FsUpdatePayload,
  ) {
    if (!id?.trim()) throw new BadRequestException('id is required');
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'FS Update', 'update');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.fsType !== undefined) row.fs_type = updates.fsType;
    if (updates.amount !== undefined) row.amount = updates.amount;
    if (updates.irr !== undefined) row.irr = updates.irr;
    if (updates.paybackPeriod !== undefined) row.payback_period = updates.paybackPeriod;
    if (updates.npv !== undefined) row.npv = updates.npv;
    if (updates.roi !== undefined) row.roi = updates.roi;
    if (updates.plannedRevenueStartDate !== undefined) row.planned_revenue_start_date = updates.plannedRevenueStartDate;
    if (updates.actualRevenueStartDate !== undefined) row.actual_revenue_start_date = updates.actualRevenueStartDate;
    if (updates.monthlyRevenuePlan !== undefined) row.monthly_revenue_plan = updates.monthlyRevenuePlan;
    if (updates.throughput !== undefined) row.throughput = updates.throughput;
    if (updates.conclusion !== undefined) row.conclusion = updates.conclusion;
    if (updates.followUpAction !== undefined) row.follow_up_action = updates.followUpAction;

    const { data, error } = await client
      .from('feasibility_studies')
      .update(row)
      .eq('id', id.trim())
      .select(FS_STUDY_COLUMNS)
      .single();
    if (error) throw new BadRequestException(error.message);
    return toCamelCase(data);
  }

  async listRealizations(accessToken: string, userId: number, fsId: string) {
    if (!fsId?.trim()) throw new BadRequestException('fsId is required');
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'FS Realization', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const { data, error } = await client
      .from('fs_realizations')
      .select(FS_REALIZATION_COLUMNS)
      .eq('fs_id', fsId.trim())
      .order('month', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return { realizations: data ? data.map(toCamelCase) : [] };
  }

  async saveRealization(accessToken: string, userId: number, payload: FsRealizationPayload) {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'FS Realization', 'update');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    const id = payload.id || `FSR-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const row = {
      id,
      fs_id: payload.fsId,
      month: payload.month,
      actual_revenue: payload.actualRevenue,
      actual_throughput: payload.actualThroughput ?? 0,
      notes: payload.notes ?? null,
      created_at: now,
      updated_at: now,
    };
    const { data, error } = await client
      .from('fs_realizations')
      .upsert(row, { onConflict: 'id' })
      .select(FS_REALIZATION_COLUMNS)
      .single();
    if (error) throw new BadRequestException(error.message);
    return toCamelCase(data);
  }
}
