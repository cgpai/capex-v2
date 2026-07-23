import type { SupabaseClient } from '@supabase/supabase-js';
import { escapeIlikePattern } from '../shared/postgrest-filter.util';

export const BATCH_SIZE = 400;

export const normId = (v: unknown) => (v == null ? '' : String(v));

/** Stable map key for asset_id across PostgREST rows (UUID casing can differ). */
export const canonicalAssetKey = (v: unknown): string =>
  v == null || v === '' ? '' : String(v).trim().toLowerCase();

export const normRoleId = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' && Number.isFinite(v) ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
};

export function toCamelCase(obj: unknown): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj !== 'object') return obj;

  const camelObj: Record<string, unknown> = {};
  for (const key of Object.keys(obj as object)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    let value = toCamelCase((obj as Record<string, unknown>)[key]);

    if (camelKey === 'status' && typeof (obj as Record<string, unknown>)[key] === 'string') {
      const statusValue = (obj as Record<string, unknown>)[key] as string;
      if (statusValue === 'Done' || statusValue === 'done') value = 'Done';
      else if (statusValue === 'Open' || statusValue === 'open') value = 'Open';
      else if (statusValue === 'Locked' || statusValue === 'locked') value = 'Locked';
    }
    camelObj[camelKey] = value;
  }
  return camelObj;
}

export const normTaskLogRow = (row: unknown) => {
  const r = toCamelCase(row) as Record<string, unknown>;
  return { ...r, assetId: normId(r.assetId), taskId: normId(r.taskId) };
};

export const normAssetTaskStatusRow = (row: unknown) => {
  const r = toCamelCase(row) as Record<string, unknown>;
  return { ...r, assetId: normId(r.assetId), taskId: normId(r.taskId) };
};

export async function fetchAllRecords(
  client: SupabaseClient,
  tableName: string,
  selectQuery: string = '*',
  batchSize: number = BATCH_SIZE,
): Promise<any[]> {
  let allRecords: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await client
      .from(tableName)
      .select(selectQuery)
      .range(from, from + batchSize - 1);

    if (error) {
      throw new Error(`${tableName}: ${error.message}`);
    }

    if (data && data.length > 0) {
      allRecords = [...allRecords, ...data];
      from += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  return allRecords;
}

const ASSET_CODE_IN_CHUNK = 80;

/** Lookup asset by exact codes from migration file — avoids loading entire assets table. */
export async function fetchAssetsByCodes(
  client: SupabaseClient,
  assetCodes: string[],
): Promise<any[]> {
  const unique = [...new Set(assetCodes.map((c) => String(c || '').trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const foundByLower = new Map<string, any>();
  for (let i = 0; i < unique.length; i += ASSET_CODE_IN_CHUNK) {
    const chunk = unique.slice(i, i + ASSET_CODE_IN_CHUNK);
    const { data, error } = await client
      .from('assets')
      .select('id, asset_code, workflow_set_id, project_id')
      .in('asset_code', chunk);
    if (error) {
      throw new Error(`assets by asset_code: ${error.message}`);
    }
    (data || []).forEach((row: any) => {
      const key = String(row.asset_code || '').trim().toLowerCase();
      if (key) foundByLower.set(key, row);
    });
  }

  const missing = unique.filter((c) => !foundByLower.has(c.toLowerCase()));
  for (const code of missing) {
    const { data, error } = await client
      .from('assets')
      .select('id, asset_code, workflow_set_id, project_id')
      .ilike('asset_code', escapeIlikePattern(code))
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`assets ilike asset_code: ${error.message}`);
    }
    if (data) {
      const key = String(data.asset_code || '').trim().toLowerCase();
      if (key) foundByLower.set(key, data);
    }
  }

  return Array.from(foundByLower.values());
}

const PO_MIGRATION_ASSET_SELECT =
  'id, asset_code, asset_name, description, project_id, budget_plan, budget_allocated, consumed_budget, workflow_set_id, budget_category_id, end_target_date, catalogue_id, po_number, po_date, is_goods_received, bdd_priority, asset_type_id, qty, received_qty, lifecycle_status';

/** Lookup asset untuk migrasi PO — baris lengkap untuk upsert batch. */
export async function fetchAssetsByCodesForPoMigration(
  client: SupabaseClient,
  assetCodes: string[],
): Promise<any[]> {
  const unique = [...new Set(assetCodes.map((c) => String(c || '').trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const foundByLower = new Map<string, any>();
  for (let i = 0; i < unique.length; i += ASSET_CODE_IN_CHUNK) {
    const chunk = unique.slice(i, i + ASSET_CODE_IN_CHUNK);
    const { data, error } = await client
      .from('assets')
      .select(PO_MIGRATION_ASSET_SELECT)
      .in('asset_code', chunk);
    if (error) {
      throw new Error(`assets PO migration by asset_code: ${error.message}`);
    }
    (data || []).forEach((row: any) => {
      const key = String(row.asset_code || '').trim().toLowerCase();
      if (key) foundByLower.set(key, row);
    });
  }

  const missing = unique.filter((c) => !foundByLower.has(c.toLowerCase()));
  for (const code of missing) {
    const { data, error } = await client
      .from('assets')
      .select(PO_MIGRATION_ASSET_SELECT)
      .ilike('asset_code', escapeIlikePattern(code))
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`assets PO migration ilike asset_code: ${error.message}`);
    }
    if (data) {
      const key = String(data.asset_code || '').trim().toLowerCase();
      if (key) foundByLower.set(key, data);
    }
  }

  return Array.from(foundByLower.values());
}

const FS_MIGRATION_PROJECT_SELECT =
  'id, project_code, period_name, ax_code, approved_budget, target_budget_start, budget_revenue_permonth, is_routine_asset_aggregator, hospital_unit_id';

/** Lookup project untuk migrasi FS Updates — baris ringkas untuk patch batch. */
export async function fetchProjectsByCodesForFsMigration(
  client: SupabaseClient,
  projectCodes: string[],
): Promise<any[]> {
  const unique = [...new Set(projectCodes.map((c) => String(c || '').trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const foundByLower = new Map<string, any>();
  for (let i = 0; i < unique.length; i += ASSET_CODE_IN_CHUNK) {
    const chunk = unique.slice(i, i + ASSET_CODE_IN_CHUNK);
    const { data, error } = await client
      .from('projects')
      .select(FS_MIGRATION_PROJECT_SELECT)
      .in('project_code', chunk);
    if (error) {
      throw new Error(`projects FS migration by project_code: ${error.message}`);
    }
    (data || []).forEach((row: any) => {
      const key = String(row.project_code || '').trim().toLowerCase();
      if (key) foundByLower.set(key, row);
    });
  }

  const missing = unique.filter((c) => !foundByLower.has(c.toLowerCase()));
  for (const code of missing) {
    const { data, error } = await client
      .from('projects')
      .select(FS_MIGRATION_PROJECT_SELECT)
      .ilike('project_code', escapeIlikePattern(code))
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`projects FS migration ilike project_code: ${error.message}`);
    }
    if (data) {
      const key = String(data.project_code || '').trim().toLowerCase();
      if (key) foundByLower.set(key, data);
    }
  }

  return Array.from(foundByLower.values());
}

/**
 * Ambil semua baris yang cocok `.eq(column, value)` dengan pagination (hindari batas 1000 baris PostgREST).
 */
export async function fetchAllRecordsWhereEq(
  client: SupabaseClient,
  tableName: string,
  column: string,
  value: string | number | boolean,
  selectQuery: string = '*',
  batchSize: number = BATCH_SIZE,
): Promise<any[]> {
  let allRecords: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await client
      .from(tableName)
      .select(selectQuery)
      .eq(column, value)
      .range(from, from + batchSize - 1);

    if (error) {
      throw new Error(`${tableName} (${column}=${String(value)}): ${error.message}`);
    }

    if (data && data.length > 0) {
      allRecords = [...allRecords, ...data];
      from += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  return allRecords;
}

const IN_BATCH_IDS = 100;

/**
 * `.in(column, ids)` dalam beberapa chunk + pagination per chunk (hindari batas 1000 & URL terlalu panjang).
 */
export async function fetchRecordsInBatches(
  client: SupabaseClient,
  tableName: string,
  columnName: string,
  ids: string[],
  selectQuery: string = '*',
  idChunkSize: number = IN_BATCH_IDS,
): Promise<any[]> {
  if (ids.length === 0) return [];

  const uniqueIds = [...new Set(ids.map((id) => String(id)))].filter(Boolean);
  let allRecords: any[] = [];

  for (let i = 0; i < uniqueIds.length; i += idChunkSize) {
    const batch = uniqueIds.slice(i, i + idChunkSize);
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await client
        .from(tableName)
        .select(selectQuery)
        .in(columnName, batch)
        .range(from, from + BATCH_SIZE - 1);

      if (error) {
        throw new Error(`${tableName} (${columnName} in batch): ${error.message}`);
      }

      if (data && data.length > 0) {
        allRecords = [...allRecords, ...data];
        from += BATCH_SIZE;
        hasMore = data.length === BATCH_SIZE;
      } else {
        hasMore = false;
      }
    }
  }

  return allRecords;
}

/** PostgREST: keep IN batches small to avoid URL/query limits. */
const ASSET_ID_IN_CHUNK = 120;

/**
 * Only rows for the given assets — avoids full-table scans (major latency win vs fetchAllRecords).
 */
export async function fetchRecordsByAssetIds(
  client: SupabaseClient,
  tableName: 'asset_task_statuses' | 'task_logs',
  assetIds: string[],
  selectQuery = '*',
): Promise<any[]> {
  const unique = [...new Set(assetIds.map((id) => String(id)))].filter(Boolean);
  if (unique.length === 0) return [];

  const out: any[] = [];
  for (let i = 0; i < unique.length; i += ASSET_ID_IN_CHUNK) {
    const chunk = unique.slice(i, i + ASSET_ID_IN_CHUNK);
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await client
        .from(tableName)
        .select(selectQuery)
        .in('asset_id', chunk)
        .range(from, from + BATCH_SIZE - 1);
      if (error) {
        throw new Error(`${tableName} by asset_id: ${error.message}`);
      }
      if (data && data.length > 0) {
        out.push(...data);
        from += BATCH_SIZE;
        hasMore = data.length === BATCH_SIZE;
      } else {
        hasMore = false;
      }
    }
  }
  return out;
}
