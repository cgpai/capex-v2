import type { SupabaseClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { fetchAssetsByCodesForPoMigration } from '../project-list/supabase-helpers';
import { perfCacheDeleteByPrefix } from '../shared/perf-cache';
import { setMigrationProgress } from './migration-progress.util';
import type { MigrationResultPayload } from './smart-migration.types';
import {
  isEmptyMigrationCellValue,
  parseExcelDateValue,
  parseMigrationNumberValue,
} from './excel-parse';

const PO_UPDATES_UPSERT_BATCH = 400;
const PROGRESS_EVERY_ROWS = 50;

const poUpdatesSchemaKeys = new Set(['assetCode', 'cprId', 'poNumber', 'poDate', 'consumedBudget']);

export const normalizeMigrationAssetCode = (value: unknown): string =>
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

function mapPoRow(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
): { mapped: Record<string, unknown>; hasAnyData: boolean } {
  const mapped: Record<string, unknown> = {};
  let hasAnyData = false;
  for (const [header, sysKey] of Object.entries(mapping)) {
    if (!sysKey || !poUpdatesSchemaKeys.has(sysKey)) continue;
    let value = row[header];
    if (value !== undefined && value !== null && value !== '') hasAnyData = true;
    if (sysKey === 'consumedBudget') {
      value = parseMigrationNumberValue(value);
    } else if (sysKey === 'poDate') {
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

function assetRowToUpsertPayload(
  row: Record<string, unknown>,
  overrides: {
    poNumber?: string | null;
    cprId?: string | null;
    poDate?: string | null;
    consumedBudget?: number;
  },
): Record<string, unknown> {
  return {
    id: row.id,
    asset_code: row.asset_code,
    asset_name: row.asset_name,
    description: row.description ?? null,
    project_id: row.project_id,
    budget_plan: Number(row.budget_plan) || 0,
    budget_allocated: Number(row.budget_allocated) || 0,
    consumed_budget:
      overrides.consumedBudget !== undefined
        ? overrides.consumedBudget
        : Number(row.consumed_budget) || 0,
    workflow_set_id: row.workflow_set_id,
    budget_category_id: row.budget_category_id,
    end_target_date: row.end_target_date ?? null,
    catalogue_id: row.catalogue_id ?? null,
    po_number: overrides.poNumber !== undefined ? overrides.poNumber : (row.po_number ?? null),
    cpr_id: overrides.cprId !== undefined ? overrides.cprId : (row.cpr_id ?? null),
    po_date: overrides.poDate !== undefined ? overrides.poDate : (row.po_date ?? null),
    is_goods_received: Boolean(row.is_goods_received),
    bdd_priority: row.bdd_priority ?? null,
    asset_type_id: row.asset_type_id ?? null,
    qty: Number(row.qty ?? 1),
    received_qty: Number(row.received_qty ?? 0),
    lifecycle_status: row.lifecycle_status ?? null,
  };
}

async function upsertPoPatchesBatched(
  client: SupabaseClient,
  rows: Record<string, unknown>[],
  jobId: string | undefined,
  ownerUserId: number,
  totalRows: number,
  failedSoFar: number,
): Promise<number> {
  let savedTotal = 0;
  let batchIndex = 0;
  const batchCount = Math.max(1, Math.ceil(rows.length / PO_UPDATES_UPSERT_BATCH));

  for (let i = 0; i < rows.length; i += PO_UPDATES_UPSERT_BATCH) {
    batchIndex++;
    const slice = rows.slice(i, i + PO_UPDATES_UPSERT_BATCH);
    reportProgress(jobId, ownerUserId, {
      stage: 'saving',
      processedRows: Math.min(totalRows, savedTotal + slice.length),
      totalRows,
      partialSaveIndex: batchIndex,
      savedCount: savedTotal,
      failedCount: failedSoFar,
      message: `Menyimpan batch ${batchIndex}/${batchCount} ke database (${slice.length} aset)…`,
    });

    const { error } = await client.from('assets').upsert(slice, { onConflict: 'id' });
    if (error) throw new Error(error.message);
    savedTotal += slice.length;

    reportProgress(jobId, ownerUserId, {
      stage: 'saving',
      processedRows: Math.min(totalRows, savedTotal),
      totalRows,
      partialSaveIndex: batchIndex,
      savedCount: savedTotal,
      failedCount: failedSoFar,
      message: `${savedTotal} aset PO sudah tersimpan ke database.`,
    });
  }

  return savedTotal;
}

export async function runPoUpdatesMigration(
  client: SupabaseClient,
  fileBuffer: Buffer,
  mapping: Record<string, string>,
  currentUser: { id: number; username: string },
  userId: number,
  originalFileName: string,
  jobId?: string,
): Promise<MigrationResultPayload> {
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
    message: `File dibaca — ${totalRows} baris. Mencari kode asset di database…`,
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
      if (sysKey !== 'assetCode') continue;
      const v = row[header];
      const code = normalizeMigrationAssetCode(v);
      if (code) codesLower.add(code.toLowerCase());
    }
  }

  const assetRows = await fetchAssetsByCodesForPoMigration(client, [...codesLower]);
  const assetByCode = new Map<string, Record<string, unknown>>();
  for (const row of assetRows) {
    const key = String(row.asset_code || '').trim().toLowerCase();
    if (key) assetByCode.set(key, row);
  }

  reportProgress(jobId, userId, {
    stage: 'preparing',
    processedRows: 0,
    totalRows,
    message: `Ditemukan ${assetRows.length}/${codesLower.size} kode asset. Memvalidasi baris Excel…`,
  });

  const pendingUpserts: { rowIndex: number; assetCode: string; payload: Record<string, unknown> }[] =
    [];
  let validatedRows = 0;

  for (let i = 0; i < rawData.length; i++) {
    const { mapped, hasAnyData } = mapPoRow(rawData[i], mapping);
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
        message: `Memvalidasi baris ${i + 1} / ${totalRows} (${pendingUpserts.length} siap disimpan, ${result.failedCount} gagal)…`,
      });
    }

    if (!mapped.assetCode || String(mapped.assetCode).trim() === '') {
      result.failedCount++;
      result.errors.push(`Row ${i + 1}: Missing required field 'Asset Code'`);
      continue;
    }

    try {
      const assetCode = normalizeMigrationAssetCode(mapped.assetCode);
      const asset = assetByCode.get(assetCode.toLowerCase());
      if (!asset) {
        throw new Error(
          `Asset Code '${assetCode}' not found. Asset harus sudah terdaftar di tabel assets (import via Smart Migration → Assets jika belum ada).`,
        );
      }

      const hasCpr =
        mapped.cprId !== undefined &&
        mapped.cprId !== null &&
        String(mapped.cprId).trim() !== '';
      const hasPoNumber =
        mapped.poNumber !== undefined &&
        mapped.poNumber !== null &&
        String(mapped.poNumber).trim() !== '';
      const hasPoValue =
        mapped.consumedBudget !== undefined &&
        mapped.consumedBudget !== null &&
        mapped.consumedBudget !== '' &&
        Number(mapped.consumedBudget) > 0;
      const hasPoDate =
        mapped.poDate !== undefined &&
        mapped.poDate !== null &&
        String(mapped.poDate).trim() !== '';

      if (!hasCpr && !hasPoNumber && !hasPoValue) {
        throw new Error('Isi minimal satu dari CPR ID, PO Number, atau PO Value.');
      }

      let resolvedPoDate: string | null = asset.po_date
        ? String(asset.po_date).slice(0, 10)
        : null;
      if (hasPoDate) {
        const parsed = parseExcelDateValue(mapped.poDate);
        resolvedPoDate = parsed ? parsed.slice(0, 10) : String(mapped.poDate).trim();
      } else if (hasCpr || hasPoNumber || hasPoValue) {
        resolvedPoDate = new Date().toISOString().slice(0, 10);
      }

      const payload = assetRowToUpsertPayload(asset, {
        consumedBudget: hasPoValue ? Number(mapped.consumedBudget) : undefined,
        poNumber: hasPoNumber ? String(mapped.poNumber).trim() : undefined,
        cprId: hasCpr ? String(mapped.cprId).trim() : undefined,
        poDate: resolvedPoDate,
      });

      pendingUpserts.push({ rowIndex: i, assetCode, payload });
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
    message: `Validasi selesai — ${pendingUpserts.length} aset siap disimpan, ${result.failedCount} baris gagal.`,
  });

  if (pendingUpserts.length > 0) {
    try {
      const saved = await upsertPoPatchesBatched(
        client,
        pendingUpserts.map((r) => r.payload),
        jobId,
        userId,
        totalRows,
        result.failedCount,
      );
      result.updatedCount = saved;
    } catch (batchErr: unknown) {
      const batchMessage = batchErr instanceof Error ? batchErr.message : String(batchErr);
      let savedFallback = 0;
      for (let j = 0; j < pendingUpserts.length; j++) {
        const row = pendingUpserts[j];
        if (j === 0 || (j + 1) % PROGRESS_EVERY_ROWS === 0 || j === pendingUpserts.length - 1) {
          reportProgress(jobId, userId, {
            stage: 'saving',
            processedRows: Math.min(totalRows, j + 1),
            totalRows,
            savedCount: savedFallback,
            failedCount: result.failedCount,
            message: `Menyimpan satu per satu… ${j + 1}/${pendingUpserts.length}`,
          });
        }
        const { error } = await client.from('assets').upsert(row.payload, { onConflict: 'id' });
        if (error) {
          result.failedCount++;
          result.errors.push(`Row ${row.rowIndex + 1} (${row.assetCode}) — ${error.message}`);
        } else {
          savedFallback++;
          result.updatedCount++;
        }
      }
      if (result.updatedCount === 0 && pendingUpserts.length > 0) {
        result.errors.unshift(`Batch upsert gagal: ${batchMessage}`);
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
      message: 'Membersihkan cache halaman PO Update…',
    });
    await perfCacheDeleteByPrefix(`app:table:po-update:page:${userId}:`);
  }

  try {
    await client.from('audit_logs').upsert({
      id: `audit-mig-${Date.now()}`,
      entity_id: `PoUpdates-${Date.now()}`,
      entity_type: 'Migration',
      action: 'Import',
      field_name: 'File Import',
      old_value: null,
      new_value: `Imported PoUpdates: ${result.updatedCount} diperbarui, ${result.skippedCount} dilewati, gagal ${result.failedCount} — ${originalFileName}`,
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
      ? `Selesai — ${result.updatedCount} aset diperbarui${result.failedCount > 0 ? `, ${result.failedCount} baris gagal` : ''}.`
      : `Migrasi gagal — ${result.failedCount} baris error, tidak ada data tersimpan.`,
  });

  return result;
}
