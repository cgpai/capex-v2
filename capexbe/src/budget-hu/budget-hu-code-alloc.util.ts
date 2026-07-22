import type { SupabaseClient } from '@supabase/supabase-js';

const ASSET_SEQ_PAD = 3;
const PROJECT_NN_PAD = 2;
const ROUTINE_PROJECT_SEGMENT = 'RA';
const ROUTINE_ASSET_SEGMENT = '00';

export function resolveAssetCodePrefix(projectCode: string): string {
  const code = String(projectCode ?? '').trim();
  const parts = code.split('.');
  if (parts.length >= 3 && parts[2].toUpperCase() === ROUTINE_PROJECT_SEGMENT) {
    return `${parts[0]}.${parts[1]}.${ROUTINE_ASSET_SEGMENT}`;
  }
  return code;
}

export function parseProjectNn(projectCode: string, huCode: string, yy: string): number | null {
  const parts = String(projectCode ?? '').trim().split('.');
  if (parts.length < 3 || parts[0] !== huCode || parts[1] !== yy) return null;
  if (parts[2].toUpperCase() === ROUTINE_PROJECT_SEGMENT) return null;
  const n = parseInt(parts[2], 10);
  return Number.isFinite(n) ? n : null;
}

export function parseAssetSequence(assetCode: string, prefix: string): number | null {
  const normalizedPrefix = `${prefix}.`;
  const code = String(assetCode ?? '').trim();
  if (!code.startsWith(normalizedPrefix)) return null;
  const suffix = code.slice(normalizedPrefix.length);
  if (!/^\d+$/.test(suffix)) return null;
  const n = parseInt(suffix, 10);
  return Number.isFinite(n) ? n : null;
}

function isRoutineProjectCode(code: string): boolean {
  const parts = String(code ?? '').trim().split('.');
  return parts.length >= 3 && parts[2].toUpperCase() === ROUTINE_PROJECT_SEGMENT;
}

function formatProjectNn(n: number): string {
  return String(n).padStart(PROJECT_NN_PAD, '0');
}

/**
 * Scan projects table for max numeric running number (fallback when RPC unavailable).
 */
async function maxProjectNnFromDb(
  client: SupabaseClient,
  huCode: string,
  yy: string,
  excludeProjectId?: string | null,
): Promise<{ maxNn: number; used: Set<string> }> {
  const { data, error } = await client
    .from('projects')
    .select('id, project_code')
    .like('project_code', `${huCode}.${yy}.%`);
  if (error) throw error;

  const used = new Set<string>();
  let maxNn = 0;
  for (const row of data || []) {
    const id = String((row as { id?: string }).id ?? '');
    const code = String((row as { project_code?: string }).project_code ?? '').trim();
    if (!code) continue;
    if (excludeProjectId && id === excludeProjectId) continue;
    used.add(code.toUpperCase());
    const nn = parseProjectNn(code, huCode, yy);
    if (nn != null && nn > maxNn) maxNn = nn;
  }
  return { maxNn, used };
}

/**
 * Next free project code for HU+YY.
 * Prefers atomic RPC `reserve_next_project_nn` so concurrent browsers never mint the same nn.
 */
export async function allocateNextProjectCode(
  client: SupabaseClient,
  huCode: string,
  yy: string,
  preferred?: string | null,
  excludeProjectId?: string | null,
  options?: { forceReserve?: boolean },
): Promise<string> {
  const preferredCode = String(preferred ?? '').trim();
  if (isRoutineProjectCode(preferredCode) || preferredCode.toUpperCase().endsWith(`.${ROUTINE_PROJECT_SEGMENT}`)) {
    return `${huCode}.${yy}.${ROUTINE_PROJECT_SEGMENT}`;
  }

  const forceReserve = options?.forceReserve !== false;

  // New creates: always bump atomic sequence (ignore preferred — preferred races across tabs).
  if (forceReserve && !excludeProjectId) {
    const { data: reservedNn, error: rpcError } = await client.rpc('reserve_next_project_nn', {
      p_hu_code: huCode,
      p_yy: yy,
    });
    if (!rpcError && reservedNn != null && Number.isFinite(Number(reservedNn))) {
      return `${huCode}.${yy}.${formatProjectNn(Number(reservedNn))}`;
    }
  }

  // Update existing / RPC missing: keep preferred when free, else next after DB max.
  const { maxNn, used } = await maxProjectNnFromDb(client, huCode, yy, excludeProjectId);

  if (
    preferredCode &&
    excludeProjectId &&
    !used.has(preferredCode.toUpperCase())
  ) {
    return preferredCode;
  }

  // Try RPC even for updates when preferred is taken / missing.
  if (forceReserve) {
    const { data: reservedNn, error: rpcError } = await client.rpc('reserve_next_project_nn', {
      p_hu_code: huCode,
      p_yy: yy,
    });
    if (!rpcError && reservedNn != null && Number.isFinite(Number(reservedNn))) {
      return `${huCode}.${yy}.${formatProjectNn(Number(reservedNn))}`;
    }
  }

  let n = maxNn + 1;
  while (n < 100_000) {
    const candidate = `${huCode}.${yy}.${formatProjectNn(n)}`;
    if (!used.has(candidate.toUpperCase())) return candidate;
    n += 1;
  }
  throw new Error(`Cannot allocate project code for ${huCode}.${yy}`);
}

/**
 * Next free asset code under a project. Uses atomic RPC when available.
 */
export async function allocateNextAssetCode(
  client: SupabaseClient,
  projectCode: string,
  preferred?: string | null,
  excludeAssetId?: string | null,
  options?: { forceReserve?: boolean },
): Promise<string> {
  const prefix = resolveAssetCodePrefix(projectCode);
  const preferredCode = String(preferred ?? '').trim();
  const forceReserve = options?.forceReserve !== false;

  if (forceReserve && !excludeAssetId) {
    const { data: reservedSeq, error: rpcError } = await client.rpc('reserve_next_asset_seq', {
      p_project_code: String(projectCode).trim(),
    });
    if (!rpcError && reservedSeq != null && Number.isFinite(Number(reservedSeq))) {
      return `${prefix}.${String(Number(reservedSeq)).padStart(ASSET_SEQ_PAD, '0')}`;
    }
  }

  const legacyPrefix =
    prefix !== String(projectCode).trim() ? String(projectCode).trim() : null;

  const { data: projectRow } = await client
    .from('projects')
    .select('id')
    .eq('project_code', String(projectCode).trim())
    .maybeSingle();

  let rows: Array<{ id?: string; asset_code?: string }> | null = null;
  if (projectRow?.id) {
    const { data, error } = await client
      .from('assets')
      .select('id, asset_code')
      .eq('project_id', projectRow.id);
    if (error) throw error;
    rows = data;
  } else {
    const { data, error } = await client
      .from('assets')
      .select('id, asset_code')
      .like('asset_code', `${prefix}.%`);
    if (error) throw error;
    rows = data;
  }

  const usedByOther = new Set<string>();
  let maxSeq = 0;
  for (const row of rows || []) {
    const id = String(row.id ?? '');
    const code = String(row.asset_code ?? '').trim();
    if (!code) continue;
    if (excludeAssetId && id === excludeAssetId) continue;
    usedByOther.add(code.toUpperCase());
    for (const p of [prefix, legacyPrefix].filter(Boolean) as string[]) {
      const seq = parseAssetSequence(code, p);
      if (seq != null && seq > maxSeq) maxSeq = seq;
    }
  }

  if (preferredCode && excludeAssetId && !usedByOther.has(preferredCode.toUpperCase())) {
    return preferredCode;
  }

  if (forceReserve) {
    const { data: reservedSeq, error: rpcError } = await client.rpc('reserve_next_asset_seq', {
      p_project_code: String(projectCode).trim(),
    });
    if (!rpcError && reservedSeq != null && Number.isFinite(Number(reservedSeq))) {
      return `${prefix}.${String(Number(reservedSeq)).padStart(ASSET_SEQ_PAD, '0')}`;
    }
  }

  let n = maxSeq + 1;
  while (n < 100_000) {
    const candidate = `${prefix}.${String(n).padStart(ASSET_SEQ_PAD, '0')}`;
    if (!usedByOther.has(candidate.toUpperCase())) return candidate;
    n += 1;
  }
  throw new Error(`Cannot allocate asset code for project ${projectCode}`);
}

/** When project code is remapped, rewrite asset code prefix while keeping sequence. */
export function remapAssetCodePrefix(
  assetCode: string,
  oldProjectCode: string,
  newProjectCode: string,
): string {
  const code = String(assetCode ?? '').trim();
  if (!code) return code;
  const oldPrefix = resolveAssetCodePrefix(oldProjectCode);
  const newPrefix = resolveAssetCodePrefix(newProjectCode);
  if (oldPrefix === newPrefix) return code;

  for (const p of [oldPrefix, String(oldProjectCode).trim()]) {
    const seq = parseAssetSequence(code, p);
    if (seq != null) {
      return `${newPrefix}.${String(seq).padStart(ASSET_SEQ_PAD, '0')}`;
    }
  }
  return code;
}
