import type { SupabaseClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { getAllHospitalUnitsConfig } from '../project-list/master-data.loader';
import { fetchProjectsByCodesForFsMigration } from '../project-list/supabase-helpers';
import { perfCacheDeleteByPrefix } from '../shared/perf-cache';
import { setMigrationProgress } from './migration-progress.util';
import type { MigrationResultPayload } from './smart-migration.types';
import {
  isEmptyMigrationCellValue,
  parseExcelDateValue,
  parseMigrationNumberValue,
} from './excel-parse';

const PIPELINE_ARCHETYPE_ID = 'PIPE';
const FS_UPDATES_UPDATE_BATCH = 400;
const FS_UPDATE_CONCURRENCY = 30;
const PROGRESS_EVERY_ROWS = 50;

const fsUpdatesSchemaKeys = new Set([
  'projectCode',
  'axCode',
  'approvedBudget',
  'targetBudgetStart',
  'budgetRevenuePermonth',
]);

export const normalizeMigrationProjectCode = (value: unknown): string =>
  String(value ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();

function reportProgress(
  jobId: string | undefined,
  ownerUserId: number,
  progress: Omit<import('./migration-progress.util').MigrationProgressDto, 'updatedAt'>,
): void {
  if (!jobId) return;
  setMigrationProgress(jobId, ownerUserId, progress);
}

function mapFsRow(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
): { mapped: Record<string, unknown>; hasAnyData: boolean } {
  const mapped: Record<string, unknown> = {};
  let hasAnyData = false;
  for (const [header, sysKey] of Object.entries(mapping)) {
    if (!sysKey || !fsUpdatesSchemaKeys.has(sysKey)) continue;
    let value = row[header];
    if (value !== undefined && value !== null && value !== '') hasAnyData = true;
    if (sysKey === 'approvedBudget' || sysKey === 'budgetRevenuePermonth') {
      value = parseMigrationNumberValue(value);
    } else if (sysKey === 'targetBudgetStart') {
      if (isEmptyMigrationCellValue(value)) {
        value = '';
      } else {
        value = parseExcelDateValue(value) ?? '';
      }
    }
    mapped[sysKey] = value;
  }
  return { mapped, hasAnyData };
}

function isSpecialFsProject(
  project: Record<string, unknown>,
  huArchetypeById: Map<string, string>,
): boolean {
  if (Boolean(project.is_routine_asset_aggregator)) return true;
  const huId = String(project.hospital_unit_id || '').trim();
  if (!huId) return false;
  return huArchetypeById.get(huId) === PIPELINE_ARCHETYPE_ID;
}

async function applyFsPatchesBatched(
  client: SupabaseClient,
  patches: { rowIndex: number; projectCode: string; projectId: string; update: Record<string, unknown> }[],
  jobId: string | undefined,
  ownerUserId: number,
  totalRows: number,
  failedSoFar: number,
): Promise<number> {
  let savedTotal = 0;
  let batchIndex = 0;
  const batchCount = Math.max(1, Math.ceil(patches.length / FS_UPDATES_UPDATE_BATCH));

  for (let i = 0; i < patches.length; i += FS_UPDATES_UPDATE_BATCH) {
    batchIndex++;
    const slice = patches.slice(i, i + FS_UPDATES_UPDATE_BATCH);
    reportProgress(jobId, ownerUserId, {
      stage: 'saving',
      processedRows: Math.min(totalRows, savedTotal + slice.length),
      totalRows,
      partialSaveIndex: batchIndex,
      savedCount: savedTotal,
      failedCount: failedSoFar,
      message: `Menyimpan batch ${batchIndex}/${batchCount} ke database (${slice.length} project)…`,
    });

    for (let j = 0; j < slice.length; j += FS_UPDATE_CONCURRENCY) {
      const chunk = slice.slice(j, j + FS_UPDATE_CONCURRENCY);
      await Promise.all(
        chunk.map(async (patch) => {
          const { error } = await client.from('projects').update(patch.update).eq('id', patch.projectId);
          if (error) throw new Error(`${patch.projectCode}: ${error.message}`);
        }),
      );
    }

    savedTotal += slice.length;
    reportProgress(jobId, ownerUserId, {
      stage: 'saving',
      processedRows: Math.min(totalRows, savedTotal),
      totalRows,
      partialSaveIndex: batchIndex,
      savedCount: savedTotal,
      failedCount: failedSoFar,
      message: `${savedTotal} project FS sudah tersimpan ke database.`,
    });
  }

  return savedTotal;
}

export async function runFsUpdatesMigration(
  client: SupabaseClient,
  fileBuffer: Buffer,
  mapping: Record<string, string>,
  currentUser: { id: number; username: string },
  userId: number,
  originalFileName: string,
  periodName: string | null | undefined,
  jobId?: string,
): Promise<MigrationResultPayload> {
  const period = String(periodName || '').trim();
  if (!period) {
    throw new Error('Budget Period wajib dipilih untuk migrasi FS Updates.');
  }

  reportProgress(jobId, userId, {
    stage: 'preparing',
    processedRows: 0,
    totalRows: 0,
    message: 'Membaca file Excel…',
  });

  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
  const totalRows = rawData.length;

  reportProgress(jobId, userId, {
    stage: 'preparing',
    processedRows: 0,
    totalRows,
    message: `File dibaca — ${totalRows} baris. Mencari kode project di database…`,
  });

  const result: MigrationResultPayload = {
    success: false,
    totalRows,
    insertedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    successCount: 0,
    failedCount: 0,
    errors: [],
    warnings: [],
  };

  const codesLower = new Set<string>();
  for (const row of rawData) {
    for (const [header, sysKey] of Object.entries(mapping)) {
      if (sysKey !== 'projectCode') continue;
      const code = normalizeMigrationProjectCode(row[header]);
      if (code) codesLower.add(code.toLowerCase());
    }
  }

  const [projectRows, hus] = await Promise.all([
    fetchProjectsByCodesForFsMigration(client, [...codesLower]),
    getAllHospitalUnitsConfig(client),
  ]);
  const huArchetypeById = new Map<string, string>(
    (hus || []).map((hu: any) => [String(hu.id || ''), String(hu.archetype_id || hu.archetypeId || '')]),
  );
  const projectByCode = new Map<string, Record<string, unknown>>();
  for (const row of projectRows) {
    const key = String(row.project_code || '').trim().toLowerCase();
    if (key) projectByCode.set(key, row);
  }

  reportProgress(jobId, userId, {
    stage: 'preparing',
    processedRows: 0,
    totalRows,
    message: `Ditemukan ${projectRows.length}/${codesLower.size} kode project. Memvalidasi baris Excel…`,
  });

  const pendingPatches: {
    rowIndex: number;
    projectCode: string;
    projectId: string;
    update: Record<string, unknown>;
  }[] = [];
  let validatedRows = 0;

  for (let i = 0; i < rawData.length; i++) {
    const { mapped, hasAnyData } = mapFsRow(rawData[i], mapping);
    if (!hasAnyData) continue;

    validatedRows++;
    if (
      validatedRows === 1 ||
      validatedRows % PROGRESS_EVERY_ROWS === 0 ||
      i === rawData.length - 1
    ) {
      reportProgress(jobId, userId, {
        stage: 'processing',
        processedRows: i + 1,
        totalRows,
        failedCount: result.failedCount,
        message: `Memvalidasi baris ${i + 1} / ${totalRows} (${pendingPatches.length} siap disimpan, ${result.failedCount} gagal)…`,
      });
    }

    if (!mapped.projectCode || String(mapped.projectCode).trim() === '') {
      result.failedCount++;
      result.errors.push(`Row ${i + 1}: Missing required field 'Project Code'`);
      continue;
    }

    try {
      const projectCode = normalizeMigrationProjectCode(mapped.projectCode);
      const project = projectByCode.get(projectCode.toLowerCase());
      if (!project) {
        throw new Error(
          `Project Code '${projectCode}' not found. Project harus sudah terdaftar di periode ${period}.`,
        );
      }

      const projectPeriod = String(project.period_name || '').trim();
      if (projectPeriod && projectPeriod.toLowerCase() !== period.toLowerCase()) {
        throw new Error(
          `Project Code '${projectCode}' ada di periode '${projectPeriod}', bukan '${period}'.`,
        );
      }

      if (isSpecialFsProject(project, huArchetypeById)) {
        throw new Error(
          `Project '${projectCode}' adalah Network Pipeline / General & Routine — tidak bisa diupdate via migrasi FS.`,
        );
      }

      const hasAx =
        mapped.axCode !== undefined &&
        mapped.axCode !== null &&
        String(mapped.axCode).trim() !== '';
      const hasApproved =
        mapped.approvedBudget !== undefined &&
        mapped.approvedBudget !== null &&
        mapped.approvedBudget !== '' &&
        Number(mapped.approvedBudget) > 0;
      const hasTargetStart =
        mapped.targetBudgetStart !== undefined &&
        mapped.targetBudgetStart !== null &&
        String(mapped.targetBudgetStart).trim() !== '';
      const hasRevenue =
        mapped.budgetRevenuePermonth !== undefined &&
        mapped.budgetRevenuePermonth !== null &&
        mapped.budgetRevenuePermonth !== '' &&
        Number(mapped.budgetRevenuePermonth) > 0;

      if (!hasAx && !hasApproved && !hasTargetStart && !hasRevenue) {
        throw new Error(
          'Isi minimal satu dari AX Code, Approved Budget, Target Budget Start, atau Budget Revenue / Month.',
        );
      }

      const update: Record<string, unknown> = {};
      if (hasAx) {
        update.ax_code = String(mapped.axCode).trim();
      }
      if (hasApproved) {
        update.approved_budget = Number(mapped.approvedBudget) || 0;
      }
      if (hasTargetStart) {
        const parsed = parseExcelDateValue(mapped.targetBudgetStart);
        update.target_budget_start = parsed
          ? parsed.slice(0, 10)
          : String(mapped.targetBudgetStart).trim().slice(0, 10);
      }
      if (hasRevenue) {
        update.budget_revenue_permonth = Number(mapped.budgetRevenuePermonth) || 0;
      }

      pendingPatches.push({
        rowIndex: i,
        projectCode,
        projectId: String(project.id),
        update,
      });
    } catch (err: unknown) {
      result.failedCount++;
      result.errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  reportProgress(jobId, userId, {
    stage: 'processing',
    processedRows: totalRows,
    totalRows,
    savedCount: 0,
    failedCount: result.failedCount,
    message: `Validasi selesai — ${pendingPatches.length} project siap disimpan, ${result.failedCount} baris gagal.`,
  });

  if (pendingPatches.length > 0) {
    try {
      const saved = await applyFsPatchesBatched(
        client,
        pendingPatches,
        jobId,
        userId,
        totalRows,
        result.failedCount,
      );
      result.updatedCount = saved;
    } catch (batchErr: unknown) {
      const batchMessage = batchErr instanceof Error ? batchErr.message : String(batchErr);
      let savedFallback = 0;
      for (let j = 0; j < pendingPatches.length; j++) {
        const row = pendingPatches[j];
        if (j === 0 || (j + 1) % PROGRESS_EVERY_ROWS === 0 || j === pendingPatches.length - 1) {
          reportProgress(jobId, userId, {
            stage: 'saving',
            processedRows: Math.min(totalRows, j + 1),
            totalRows,
            savedCount: savedFallback,
            failedCount: result.failedCount,
            message: `Menyimpan satu per satu… ${j + 1}/${pendingPatches.length}`,
          });
        }
        const { error } = await client.from('projects').update(row.update).eq('id', row.projectId);
        if (error) {
          result.failedCount++;
          result.errors.push(`Row ${row.rowIndex + 1} (${row.projectCode}) — ${error.message}`);
        } else {
          savedFallback++;
          result.updatedCount++;
        }
      }
      if (result.updatedCount === 0 && pendingPatches.length > 0) {
        result.errors.unshift(`Batch update gagal: ${batchMessage}`);
      }
    }
  }

  result.successCount = result.updatedCount;
  result.success = !(result.successCount === 0 && result.failedCount > 0);

  if (result.successCount > 0) {
    reportProgress(jobId, userId, {
      stage: 'finalizing',
      processedRows: totalRows,
      totalRows,
      savedCount: result.updatedCount,
      failedCount: result.failedCount,
      message: 'Membersihkan cache halaman FS Update…',
    });
    await perfCacheDeleteByPrefix(`app:table:fs-update:page:${userId}:`);
  }

  try {
    await client.from('audit_logs').upsert({
      id: `audit-mig-${Date.now()}`,
      entity_id: `FsUpdates-${Date.now()}`,
      entity_type: 'Migration',
      action: 'Import',
      field_name: 'File Import',
      old_value: null,
      new_value: `Imported FsUpdates (${period}): ${result.updatedCount} diperbarui, ${result.skippedCount} dilewati, gagal ${result.failedCount} — ${originalFileName}`,
      changed_by: currentUser.username,
      timestamp: new Date().toISOString(),
    });
  } catch {
    /* audit opsional */
  }

  reportProgress(jobId, userId, {
    stage: result.success ? 'done' : result.failedCount > 0 ? 'done' : 'error',
    processedRows: totalRows,
    totalRows,
    savedCount: result.updatedCount,
    failedCount: result.failedCount,
    message: result.success
      ? `Selesai — ${result.updatedCount} project diperbarui${result.failedCount > 0 ? `, ${result.failedCount} baris gagal` : ''}.`
      : `Migrasi gagal — ${result.failedCount} baris error, tidak ada data tersimpan.`,
  });

  return result;
}
