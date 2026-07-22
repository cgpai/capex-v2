import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthZService } from '../auth/auth-z.service';
import * as XLSX from 'xlsx';
import { getAllTasks, getAllWorkflowSets } from '../project-list/master-data.loader';
import {
  fetchAllRecords,
  fetchAssetsByCodes,
  fetchRecordsByAssetIds,
  normAssetTaskStatusRow,
} from '../project-list/supabase-helpers';
import {
  isEmptyMigrationCellValue,
  normalizeMigrationTaskName,
  parseExcelDateValue,
  parseMigrationCompletionIso,
  parseOptionalMigrationDate,
} from './excel-parse';
import { recalculateAssetTaskStatuses } from './recalculate-asset-task-statuses';
import { runFsUpdatesMigration } from './fs-updates-migration.loader';
import { runPoUpdatesMigration } from './po-updates-migration.loader';
import { getMigrationProgress, setMigrationProgress } from './migration-progress.util';
import type { MigrationResultPayload, SmartMigrationMeta } from './smart-migration.types';

export type { MigrationResultPayload, SmartMigrationMeta } from './smart-migration.types';

const TASK_FLUSH_EVERY = 400;
const RECALC_BATCH = 50;
const UPSERT_BATCH_SIZE = 200;

const taskUpdatesSchemaKeys = new Set(['assetCode', 'taskName', 'completionDate', 'rescheduleDate', 'remark']);

const normalizeMigrationAssetCode = (value: unknown): string =>
  String(value ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
const projectsSchemaKeys = new Set([
  'projectCode',
  'projectName',
  'axCode',
  'huCode',
  'budgetPlan',
  'budgetCarryForward',
  'approvedBudget',
  'categoryName',
  'priorityName',
]);
const assetsSchemaKeys = new Set([
  'projectCode',
  'assetCode',
  'assetName',
  'description',
  'budgetPlan',
  'consumedBudget',
  'workflowName',
  'endTargetDate',
]);

@Injectable()
export class SmartMigrationService {
  constructor(private readonly authZ: AuthZService) {}

  async getProgress(accessToken: string, userId: number, jobId: string) {
    const token = accessToken?.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      throw new UnauthorizedException('Missing Authorization Bearer token');
    }
    const uid = Number(userId);
    if (!Number.isFinite(uid)) {
      throw new BadRequestException('Invalid userId');
    }
    const id = String(jobId || '').trim();
    if (!id) {
      throw new BadRequestException('jobId is required');
    }
    await this.authZ.assertAnyRole(token, uid, ['super_admin', 'pmo']);
    return getMigrationProgress(id, uid);
  }

  async execute(
    accessToken: string,
    fileBuffer: Buffer,
    meta: SmartMigrationMeta,
    originalFileName: string,
  ): Promise<MigrationResultPayload> {
    const token = accessToken?.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      throw new UnauthorizedException('Missing Authorization Bearer token');
    }
    const userId = Number(meta?.userId);
    if (!Number.isFinite(userId)) {
      throw new BadRequestException('Invalid userId in meta');
    }

    const { client } = await this.authZ.assertAnyRole(token, userId, ['super_admin', 'pmo']);
    const actor = await this.resolveMigrationActor(client, userId);

    if (meta.target === 'TaskUpdates') {
      return this.runTaskUpdates(client, fileBuffer, meta.mapping, actor, originalFileName);
    }
    if (meta.target === 'PoUpdates') {
      const jobId = typeof meta.jobId === 'string' ? meta.jobId.trim() : '';
      try {
        return await runPoUpdatesMigration(
          client,
          fileBuffer,
          meta.mapping,
          actor,
          userId,
          originalFileName,
          jobId || undefined,
        );
      } catch (err: unknown) {
        if (jobId) {
          setMigrationProgress(jobId, userId, {
            stage: 'error',
            processedRows: 0,
            totalRows: 0,
            message: err instanceof Error ? err.message : 'Migrasi PO gagal.',
          });
        }
        throw err;
      }
    }
    if (meta.target === 'FsUpdates') {
      const jobId = typeof meta.jobId === 'string' ? meta.jobId.trim() : '';
      try {
        return await runFsUpdatesMigration(
          client,
          fileBuffer,
          meta.mapping,
          actor,
          userId,
          originalFileName,
          meta.periodName || null,
          jobId || undefined,
        );
      } catch (err: unknown) {
        if (jobId) {
          setMigrationProgress(jobId, userId, {
            stage: 'error',
            processedRows: 0,
            totalRows: 0,
            message: err instanceof Error ? err.message : 'Migrasi FS gagal.',
          });
        }
        throw err;
      }
    }
    if (meta.target === 'Projects') {
      return this.runProjects(
        client,
        fileBuffer,
        meta.mapping,
        actor,
        originalFileName,
        meta.periodName || null,
      );
    }
    if (meta.target === 'Assets') {
      return this.runAssets(
        client,
        fileBuffer,
        meta.mapping,
        actor,
        originalFileName,
        meta.periodName || null,
        meta.selectedAssetTypeId,
      );
    }

    throw new BadRequestException(
      `Migrasi target "${meta.target}" belum didukung backend. Gunakan jalur aplikasi (frontend).`,
    );
  }

  /** Actor for audit fields — always from JWT userId, never client-supplied meta.currentUser. */
  private async resolveMigrationActor(
    client: SupabaseClient,
    userId: number,
  ): Promise<{ id: number; username: string }> {
    const { data, error } = await client
      .from('users')
      .select('id,username')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new BadRequestException('Migration actor not found');
    return { id: Number(data.id), username: String(data.username ?? '').trim() };
  }

  private parseWorkbook(fileBuffer: Buffer): Record<string, unknown>[] {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
  }

  private mapRow(
    row: Record<string, unknown>,
    mapping: Record<string, string>,
    allowedKeys: Set<string>,
  ): { mapped: Record<string, unknown>; hasAnyData: boolean } {
    const mapped: Record<string, unknown> = {};
    let hasAnyData = false;
    for (const [header, sysKey] of Object.entries(mapping)) {
      if (!sysKey || !allowedKeys.has(sysKey)) continue;
      let value = row[header];
      if (value !== undefined && value !== null && value !== '') hasAnyData = true;
      if (sysKey === 'budgetPlan' || sysKey === 'budgetCarryForward' || sysKey === 'approvedBudget' || sysKey === 'consumedBudget') {
        if (typeof value === 'string') value = Number(value.replace(/[^0-9.-]+/g, ''));
        if (typeof value !== 'number' || Number.isNaN(value)) value = 0;
      }
      if (sysKey === 'endTargetDate' || sysKey === 'completionDate' || sysKey === 'rescheduleDate') {
        const parsed = parseExcelDateValue(value);
        if (parsed) value = parsed;
      }
      mapped[sysKey] = value;
    }
    return { mapped, hasAnyData };
  }

  private async upsertBatched(
    client: SupabaseClient,
    table: string,
    rows: Record<string, unknown>[],
    onConflict: string,
  ): Promise<void> {
    for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
      const slice = rows.slice(i, i + UPSERT_BATCH_SIZE);
      const { error } = await client.from(table).upsert(slice, { onConflict });
      if (error) throw new Error(error.message);
    }
  }

  private async getPeriodInfo(client: SupabaseClient, periodName: string | null) {
    if (!periodName) throw new BadRequestException('Budget Period is required for backend migration');
    const { data, error } = await client
      .from('budget_periods')
      .select('period_name,start_date,end_date')
      .eq('period_name', periodName)
      .maybeSingle();
    if (error || !data) throw new BadRequestException(`Period '${periodName}' not found`);
    return data;
  }

  private async runProjects(
    client: SupabaseClient,
    fileBuffer: Buffer,
    mapping: Record<string, string>,
    currentUser: { id: number; username: string },
    originalFileName: string,
    periodName: string | null,
  ): Promise<MigrationResultPayload> {
    const rawData = this.parseWorkbook(fileBuffer);
    const result: MigrationResultPayload = {
      success: false,
      totalRows: rawData.length,
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      successCount: 0,
      failedCount: 0,
      errors: [],
      warnings: [],
    };

    const period = await this.getPeriodInfo(client, periodName);
    const periodYear = period.start_date
      ? new Date(period.start_date).getFullYear().toString()
      : (periodName || '').match(/\d{4}/)?.[0] || new Date().getFullYear().toString();

    const [categories, hus, priorities, existingProjects] = await Promise.all([
      fetchAllRecords(client, 'budget_category_configs', '*'),
      fetchAllRecords(client, 'hospital_units_config', '*'),
      fetchAllRecords(client, 'project_priority_configs', '*'),
      fetchAllRecords(client, 'projects', 'id,project_code'),
    ]);

    const catMap = new Map(categories.map((c: any) => [String(c.name || '').trim().toLowerCase(), String(c.id)]));
    const huMap = new Map(hus.map((h: any) => [String(h.code || '').trim().toLowerCase(), String(h.id)]));
    const prioMap = new Map(priorities.map((p: any) => [String(p.name || '').trim().toLowerCase(), String(p.id)]));
    const defaultPrio = priorities?.[0]?.id ? String(priorities[0].id) : 'prio-must-have';
    const projectByCode = new Map<string, { id: string; projectCode: string }>();
    const usedIds = new Set<string>();
    (existingProjects || []).forEach((p: any) => {
      const code = String(p.project_code || '').trim().toLowerCase();
      if (code) projectByCode.set(code, { id: String(p.id), projectCode: String(p.project_code) });
      if (p.id != null) usedIds.add(String(p.id));
    });

    const fileCodeSet = new Set<string>();
    const pendingRows: {
      rowIndex: number;
      payload: Record<string, unknown>;
      isUpdate: boolean;
      projectCode: string;
      id: string;
    }[] = [];

    for (let i = 0; i < rawData.length; i++) {
      const { mapped, hasAnyData } = this.mapRow(rawData[i], mapping, projectsSchemaKeys);
      if (!hasAnyData) continue;
      try {
        const projectName = String(mapped.projectName || '').trim();
        const huCode = String(mapped.huCode || '').trim();
        const categoryName = String(mapped.categoryName || '').trim();
        if (!projectName || !huCode || !categoryName) {
          throw new Error(`Missing required field`);
        }
        const huId = huMap.get(huCode.toLowerCase());
        if (!huId) throw new Error(`HU Code '${huCode}' not found`);
        const catId = catMap.get(categoryName.toLowerCase());
        if (!catId) throw new Error(`Category '${categoryName}' not found`);
        const prioId = mapped.priorityName
          ? prioMap.get(String(mapped.priorityName).trim().toLowerCase()) || defaultPrio
          : defaultPrio;

        let projectCode = String(mapped.projectCode || '').trim();
        if (!projectCode) {
          const huCodeShort = huCode.substring(0, 10);
          const yy = periodYear.slice(-2);
          projectCode = `${huCodeShort}.${yy}.MIG${`${i}`.padStart(5, '0')}`.substring(0, 100);
        }
        if (projectCode.length > 100) projectCode = projectCode.substring(0, 100);
        if (fileCodeSet.has(projectCode.toLowerCase())) {
          const next = `${projectCode}-${i}`.substring(0, 100);
          result.warnings.push(`Baris ${i + 1}: projectCode ganda dalam file '${projectCode}' → '${next}'.`);
          projectCode = next;
        }
        fileCodeSet.add(projectCode.toLowerCase());

        const existing = projectByCode.get(projectCode.toLowerCase());
        let id = existing?.id || '';
        if (!id) {
          const base = `PROJ-${periodYear}-${huCode.substring(0, 10)}-${`${i}`.padStart(5, '0')}`.substring(0, 255);
          id = base;
          let bump = 0;
          while (usedIds.has(id) && bump < 200000) {
            bump++;
            id = `${base}-x${bump}`.substring(0, 255);
          }
          if (usedIds.has(id)) id = `PROJ-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`.substring(0, 255);
          usedIds.add(id);
        }

        const payload: Record<string, unknown> = {
          id,
          asset_code: null,
          ax_code: String(mapped.axCode || '').substring(0, 100) || null,
          project_name: projectName.substring(0, 255),
          asset_name: null,
          project_code: projectCode,
          completion_rate: 0,
          task_to_do: null,
          owner: null,
          target_start: period.start_date || new Date().toISOString().split('T')[0],
          end_date: period.end_date || new Date().toISOString().split('T')[0],
          status: 0,
          plan: 'A',
          budget_plan: Number(mapped.budgetPlan || 0),
          budget_carry_forward: Number(mapped.budgetCarryForward || 0),
          budget_allocated: 0,
          approved_budget: Number(mapped.approvedBudget || 0),
          consumed_budget: 0,
          revenue_projection: 0,
          target_budget_start: null,
          budget_revenue_permonth: 0,
          priority_id: String(prioId).substring(0, 255),
          type: 'Strategic Projects',
          budget_category_id: String(catId).substring(0, 255),
          hospital_unit_id: String(huId).substring(0, 255),
          is_routine_asset_aggregator: false,
          is_pipeline_project: false,
          stage: null,
        };

        pendingRows.push({
          rowIndex: i,
          payload,
          isUpdate: Boolean(existing),
          projectCode,
          id,
        });
        projectByCode.set(projectCode.toLowerCase(), { id, projectCode });
      } catch (e: any) {
        result.failedCount++;
        result.errors.push(`Row ${i + 1}: ${e?.message || e}`);
      }
    }

    if (pendingRows.length > 0) {
      try {
        await this.upsertBatched(
          client,
          'projects',
          pendingRows.map((r) => r.payload),
          'project_code',
        );
        for (const row of pendingRows) {
          if (row.isUpdate) result.updatedCount++;
          else result.insertedCount++;
        }
      } catch {
        for (const row of pendingRows) {
          const { error } = await client.from('projects').upsert(row.payload, { onConflict: 'project_code' });
          if (error) {
            result.failedCount++;
            result.errors.push(`Row ${row.rowIndex + 1}: ${error.message}`);
          } else if (row.isUpdate) {
            result.updatedCount++;
          } else {
            result.insertedCount++;
          }
        }
      }
    }

    result.successCount = result.insertedCount + result.updatedCount;
    result.success = !(result.successCount === 0 && result.failedCount > 0);
    await client.from('audit_logs').upsert({
      id: `audit-mig-${Date.now()}`,
      entity_id: `Projects-${Date.now()}`,
      entity_type: 'Migration',
      action: 'Import',
      field_name: 'File Import',
      old_value: null,
      new_value: `Imported Projects: ${result.insertedCount} baru, ${result.updatedCount} diperbarui, ${result.skippedCount} dilewati, gagal ${result.failedCount} — ${originalFileName}`,
      changed_by: currentUser.username,
      timestamp: new Date().toISOString(),
    });
    return result;
  }

  private async runAssets(
    client: SupabaseClient,
    fileBuffer: Buffer,
    mapping: Record<string, string>,
    currentUser: { id: number; username: string },
    originalFileName: string,
    periodName: string | null,
    selectedAssetTypeId?: string,
  ): Promise<MigrationResultPayload> {
    const rawData = this.parseWorkbook(fileBuffer);
    const result: MigrationResultPayload = {
      success: false,
      totalRows: rawData.length,
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      successCount: 0,
      failedCount: 0,
      errors: [],
      warnings: [],
    };

    await this.getPeriodInfo(client, periodName);
    const [projects, workflows, existingAssets] = await Promise.all([
      fetchAllRecords(client, 'projects', 'id,project_code,budget_category_id'),
      getAllWorkflowSets(client),
      fetchAllRecords(client, 'assets', '*'),
    ]);

    const projectByCode = new Map<string, any>();
    (projects || []).forEach((p: any) => {
      const k = String(p.project_code || '').trim().toLowerCase();
      if (k) projectByCode.set(k, p);
    });
    const workflowByName = new Map<string, string>();
    (workflows || []).forEach((w: any) => workflowByName.set(String(w.name || '').trim().toLowerCase(), String(w.id)));
    const defaultWorkflow = selectedAssetTypeId || (workflows?.[0]?.id ? String(workflows[0].id) : '');
    if (!defaultWorkflow) throw new BadRequestException('No workflow available for Assets migration');

    const byCode = new Map<string, any>();
    const usedCodes = new Set<string>();
    const usedIds = new Set<string>();
    (existingAssets || []).forEach((a: any) => {
      const k = String(a.asset_code || '').trim().toLowerCase();
      if (k && !byCode.has(k)) byCode.set(k, a);
      if (k) usedCodes.add(k);
      if (a.id != null) usedIds.add(String(a.id));
    });

    const pendingAssetRows: {
      rowIndex: number;
      payload: Record<string, unknown>;
      isUpdate: boolean;
      codeKey: string;
    }[] = [];

    for (let i = 0; i < rawData.length; i++) {
      const { mapped, hasAnyData } = this.mapRow(rawData[i], mapping, assetsSchemaKeys);
      if (!hasAnyData) continue;
      try {
        const pCode = String(mapped.projectCode || '').trim();
        const assetName = String(mapped.assetName || '').trim();
        if (!pCode || !assetName) throw new Error('Missing required field');
        const project = projectByCode.get(pCode.toLowerCase());
        if (!project) throw new Error(`Project Code '${pCode}' not found`);

        let workflowId = selectedAssetTypeId || '';
        if (!workflowId) {
          const wfName = String(mapped.workflowName || '').trim().toLowerCase();
          workflowId = wfName ? workflowByName.get(wfName) || defaultWorkflow : defaultWorkflow;
        }
        if (!workflowId) throw new Error('No valid workflow');

        let assetCode = String(mapped.assetCode || '').trim();
        if (!assetCode) {
          let n = 1;
          while (n < 200000) {
            const candidate = `${pCode}.${String(n).padStart(3, '0')}`;
            if (!usedCodes.has(candidate.toLowerCase())) {
              assetCode = candidate;
              break;
            }
            n++;
          }
        }
        if (!assetCode) throw new Error(`Cannot generate asset code for '${pCode}'`);

        const codeKey = assetCode.toLowerCase();
        const existing = byCode.get(codeKey);
        let id = existing?.id ? String(existing.id) : '';
        if (!id) {
          id = `ASSET-${periodName || 'MIG'}-${i}-${Math.random().toString(36).slice(2, 8)}`;
          while (usedIds.has(id)) {
            id = `ASSET-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;
          }
          usedIds.add(id);
        }

        const payload: Record<string, unknown> = {
          id,
          asset_code: assetCode,
          asset_name: assetName,
          description: String(mapped.description || '') || null,
          project_id: String(project.id),
          budget_plan: Number(mapped.budgetPlan || 0),
          budget_allocated: Number(existing?.budget_allocated || 0),
          consumed_budget: Number(mapped.consumedBudget || 0),
          workflow_set_id: workflowId,
          budget_category_id: String(project.budget_category_id || ''),
          end_target_date: mapped.endTargetDate ? String(mapped.endTargetDate) : null,
          catalogue_id: existing?.catalogue_id || null,
          po_number: existing?.po_number || null,
          is_goods_received: Boolean(existing?.is_goods_received || false),
          bdd_priority: existing?.bdd_priority || null,
          asset_type_id: existing?.asset_type_id || null,
          qty: Number(existing?.qty || 1),
          received_qty: Number(existing?.received_qty || 0),
        };

        pendingAssetRows.push({
          rowIndex: i,
          payload,
          isUpdate: Boolean(existing),
          codeKey,
        });
        byCode.set(codeKey, { ...existing, ...payload });
        usedCodes.add(codeKey);
      } catch (e: any) {
        result.failedCount++;
        result.errors.push(`Row ${i + 1}: ${e?.message || e}`);
      }
    }

    if (pendingAssetRows.length > 0) {
      const conflictKey = 'asset_code';
      try {
        await this.upsertBatched(
          client,
          'assets',
          pendingAssetRows.map((r) => r.payload),
          conflictKey,
        );
        for (const row of pendingAssetRows) {
          if (row.isUpdate) result.updatedCount++;
          else result.insertedCount++;
        }
      } catch {
        for (const row of pendingAssetRows) {
          const { error } = await client.from('assets').upsert(row.payload, { onConflict: conflictKey });
          if (error) {
            const { error: idErr } = await client.from('assets').upsert(row.payload, { onConflict: 'id' });
            if (idErr) {
              result.failedCount++;
              result.errors.push(`Row ${row.rowIndex + 1}: ${idErr.message}`);
              continue;
            }
          }
          if (row.isUpdate) result.updatedCount++;
          else result.insertedCount++;
        }
      }
    }

    result.successCount = result.insertedCount + result.updatedCount;
    result.success = !(result.successCount === 0 && result.failedCount > 0);
    await client.from('audit_logs').upsert({
      id: `audit-mig-${Date.now()}`,
      entity_id: `Assets-${Date.now()}`,
      entity_type: 'Migration',
      action: 'Import',
      field_name: 'File Import',
      old_value: null,
      new_value: `Imported Assets: ${result.insertedCount} baru, ${result.updatedCount} diperbarui, ${result.skippedCount} dilewati, gagal ${result.failedCount} — ${originalFileName}`,
      changed_by: currentUser.username,
      timestamp: new Date().toISOString(),
    });
    return result;
  }

  private async runTaskUpdates(
    client: SupabaseClient,
    fileBuffer: Buffer,
    mapping: Record<string, string>,
    currentUser: { id: number; username: string },
    originalFileName: string,
  ): Promise<MigrationResultPayload> {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });

    const result: MigrationResultPayload = {
      success: false,
      totalRows: rawData.length,
      insertedCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      successCount: 0,
      failedCount: 0,
      errors: [],
      warnings: [],
      taskLogsBatch: [],
      assetTaskStatusesBatch: [],
    };

    const norm = (id: string | number | undefined) => (id == null ? '' : String(id));

    const assetMap = new Map<string, string>();
    const assetWorkflowMap = new Map<string, string>();
    const taskNameMap = new Map<string, string>();
    const workflowTasksMap = new Map<string, Set<string>>();

    const codesLower = new Set<string>();
    for (const row of rawData) {
      let assetCodeVal = '';
      for (const [header, sysKey] of Object.entries(mapping)) {
        if (sysKey !== 'assetCode') continue;
        const v = row[header];
        if (v !== undefined && v !== null && normalizeMigrationAssetCode(v) !== '') {
          assetCodeVal = normalizeMigrationAssetCode(v);
          break;
        }
      }
      if (assetCodeVal) codesLower.add(assetCodeVal.toLowerCase());
    }

    const [assetRows, allTasks, allWorkflows] = await Promise.all([
      fetchAssetsByCodes(client, [...codesLower]),
      getAllTasks(client),
      getAllWorkflowSets(client),
    ]);

    assetRows.forEach((a: any) => {
      const id = norm(a.id);
      assetMap.set(String(a.asset_code || '').trim().toLowerCase(), id);
      assetWorkflowMap.set(id, norm(a.workflow_set_id));
    });
    allTasks.forEach((t: any) =>
      taskNameMap.set(normalizeMigrationTaskName(t.name).toLowerCase(), norm(t.id)),
    );
    allWorkflows.forEach((w: any) => {
      const taskSet = new Set<string>();
      w.steps.forEach((step: any) => taskSet.add(norm(step.taskId)));
      workflowTasksMap.set(norm(w.id), taskSet);
    });

    const codesLowerPrefetch = codesLower;
    const assetIdsPrefetch = [...codesLowerPrefetch].map((c) => assetMap.get(c)).filter((id): id is string => Boolean(id));
    const rawStatuses = await fetchRecordsByAssetIds(client, 'asset_task_statuses', assetIdsPrefetch);
    const statusById = new Map<string, any>(
      (rawStatuses || []).map((row: any) => {
        const s = normAssetTaskStatusRow(row) as unknown as { id: string };
        return [String(s.id), s];
      }),
    );

    const taskUpdateRowMeta: { rowNum: number; assetCode: string; taskName: string }[] = [];
    let taskLogsBatch: any[] = (result.taskLogsBatch as any[]) || [];
    let assetTaskStatusesBatch: any[] = (result.assetTaskStatusesBatch as any[]) || [];
    let partialSaveIndex = 0;
    let savedPairs = 0;
    const impactedAssetIds = new Set<string>();

    const flushBatch = async (forceAll: boolean) => {
      if (taskLogsBatch.length === 0) return;
      if (!forceAll && taskLogsBatch.length < TASK_FLUSH_EVERY) return;

      const take = forceAll ? taskLogsBatch.length : TASK_FLUSH_EVERY;
      const logSlice = taskLogsBatch.splice(0, take);
      const stSlice = assetTaskStatusesBatch.splice(0, take);
      const metaSlice = taskUpdateRowMeta.splice(0, take);
      partialSaveIndex++;

      const taskLogsData = logSlice.map((log: any) => ({
        id: log.id,
        asset_id: log.assetId,
        task_id: log.taskId,
        remark: log.remark || null,
        completed_at: log.completedAt,
        completed_by_user_id: log.completedByUserId,
        completed_by_username: log.completedByUsername,
        completed_by_user_role: log.completedByUserRole,
        completed_by_type: log.completedByType,
      }));
      const statusesData = stSlice.map((status: any) => ({
        id: status.id,
        asset_id: status.assetId,
        task_id: status.taskId,
        status: status.status,
        completed_at: status.completedAt || null,
        log_id: status.logId || null,
        start_date: status.startDate || null,
        target_end_date: status.targetEndDate || null,
        rescheduled_end_date: status.rescheduledEndDate || null,
        reschedule_reason: status.rescheduleReason || null,
      }));

      const { error: eLog } = await client.from('task_logs').upsert(taskLogsData);
      const { error: eSt } = await client.from('asset_task_statuses').upsert(statusesData, { onConflict: 'id' });

      if (!eLog && !eSt) {
        savedPairs += logSlice.length;
      } else {
        for (let j = 0; j < logSlice.length; j++) {
          const metaRow = metaSlice[j];
          const label = metaRow
            ? `Baris ${metaRow.rowNum} (${metaRow.assetCode} / ${metaRow.taskName})`
            : `Index ${j}`;
          const { error: le } = await client.from('task_logs').upsert([taskLogsData[j]]);
          const { error: se } = await client.from('asset_task_statuses').upsert([statusesData[j]], {
            onConflict: 'id',
          });
          if (!le && !se) {
            savedPairs++;
          } else {
            result.failedCount++;
            if (le) result.errors.push(`${label} — task_logs: ${le.message}`);
            if (se) result.errors.push(`${label} — asset_task_statuses: ${se.message}`);
          }
        }
      }
    };

    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      const mappedData: Record<string, unknown> = {};
      let hasAnyData = false;

      for (const [header, sysKey] of Object.entries(mapping)) {
        if (!sysKey || !taskUpdatesSchemaKeys.has(sysKey)) continue;
        let value = row[header];
        if (value !== undefined && value !== null && value !== '') {
          hasAnyData = true;
        }
        if (sysKey === 'completionDate' || sysKey === 'rescheduleDate') {
          if (isEmptyMigrationCellValue(value)) {
            value = '';
          } else {
            const parsedDate = parseExcelDateValue(value);
            value = parsedDate ?? '';
          }
        }
        mappedData[sysKey] = value;
      }

      if (!hasAnyData) continue;

      if (
        !mappedData.assetCode ||
        !mappedData.taskName ||
        String(mappedData.assetCode).trim() === '' ||
        String(mappedData.taskName).trim() === ''
      ) {
        result.failedCount++;
        result.errors.push(`Row ${i + 1}: Missing required field`);
        continue;
      }

      try {
        const assetCode = normalizeMigrationAssetCode(mappedData.assetCode);
        const assetId = assetMap.get(assetCode.toLowerCase());
        if (!assetId) {
          throw new Error(
            `Asset Code '${assetCode}' not found. Please ensure the asset exists in the system.`,
          );
        }

        const taskName = normalizeMigrationTaskName(mappedData.taskName);
        const taskId = taskNameMap.get(taskName.toLowerCase());
        if (!taskId) {
          throw new Error(
            `Task Name '${taskName}' not found. Please ensure the task name matches exactly with the task name in the workflow.`,
          );
        }

        const workflowId = assetWorkflowMap.get(assetId);
        if (!workflowId) {
          throw new Error(`Workflow not found for asset '${mappedData.assetCode}'.`);
        }

        const workflowTaskSet = workflowTasksMap.get(workflowId);
        if (!workflowTaskSet || !workflowTaskSet.has(taskId)) {
          throw new Error(
            `Task '${mappedData.taskName}' is not part of the workflow for asset '${mappedData.assetCode}'. Please verify the task name matches the workflow.`,
          );
        }

        const statusId = `${assetId}-${taskId}`;
        const existingRow = statusById.get(statusId) as any;
        const now = new Date();
        const completionDate = parseMigrationCompletionIso(mappedData.completionDate, now);

        const rescheduleDate = parseOptionalMigrationDate(mappedData.rescheduleDate);

        const logId = String(existingRow?.logId || '').trim() || `log-mig-${assetId}-${taskId}-${Date.now()}-${i}`;
        const newLog = {
          id: logId,
          assetId,
          taskId,
          remark: (mappedData.remark as string) || 'Task completed via Data Migration',
          completedAt: completionDate,
          completedByUserId: currentUser.id,
          completedByUsername: currentUser.username,
          completedByUserRole: 'System Admin',
          completedByType: 'User',
        };

        const status = {
          id: statusId,
          assetId,
          taskId,
          status: 'Done',
          completedAt: completionDate,
          logId,
          startDate: existingRow?.startDate || completionDate,
          targetEndDate: existingRow?.targetEndDate || completionDate,
          ...(rescheduleDate
            ? {
                rescheduledEndDate: rescheduleDate,
                rescheduleReason:
                  existingRow?.rescheduleReason || 'Imported via Data Migration',
              }
            : existingRow?.rescheduledEndDate
              ? {
                  rescheduledEndDate: existingRow.rescheduledEndDate,
                  rescheduleReason: existingRow.rescheduleReason,
                }
              : {}),
        };

        taskLogsBatch.push(newLog);
        assetTaskStatusesBatch.push(status);
        statusById.set(statusId, status);
        taskUpdateRowMeta.push({ rowNum: i + 1, assetCode: String(mappedData.assetCode), taskName: String(mappedData.taskName) });
        impactedAssetIds.add(assetId);

        if (taskLogsBatch.length >= TASK_FLUSH_EVERY) {
          await flushBatch(false);
        }
      } catch (err: any) {
        result.failedCount++;
        result.errors.push(`Row ${i + 1}: ${err?.message || err}`);
      }
    }

    if (taskLogsBatch.length > 0) {
      await flushBatch(true);
    }
    result.insertedCount = savedPairs;

    const assetIdsArray = Array.from(impactedAssetIds);
    for (let b = 0; b < assetIdsArray.length; b += RECALC_BATCH) {
      const chunk = assetIdsArray.slice(b, b + RECALC_BATCH);
      await Promise.all(
        chunk.map((aid) =>
          recalculateAssetTaskStatuses(client, aid, allWorkflows).catch(() => null),
        ),
      );
    }

    result.successCount = result.insertedCount + result.updatedCount;
    result.success = !(result.successCount === 0 && result.failedCount > 0);

    try {
      await client.from('audit_logs').upsert({
        id: `audit-mig-${Date.now()}`,
        entity_id: `TaskUpdates-${Date.now()}`,
        entity_type: 'Migration',
        action: 'Import',
        field_name: 'File Import',
        old_value: null,
        new_value: `Imported TaskUpdates: ${result.insertedCount} baru, ${result.updatedCount} diperbarui, ${result.skippedCount} dilewati, gagal ${result.failedCount} — ${originalFileName}`,
        changed_by: currentUser.username,
        timestamp: new Date().toISOString(),
      });
    } catch {
      /* audit opsional */
    }

    return result;
  }
}
