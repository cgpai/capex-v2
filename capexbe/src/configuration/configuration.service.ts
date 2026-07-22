import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthZService } from '../auth/auth-z.service';
import { createSupabaseClient, getSupabaseServiceKey } from '../shared/supabase-client.factory';
import {
  perfCacheDelete,
  perfCacheDeleteByPrefix,
  perfCacheGet,
  perfCacheSet,
} from '../shared/perf-cache';
import { cacheKeys, configurationSliceTtlMs } from '../shared/cache-keys';
import { fetchAllRecords, toCamelCase } from '../project-list/supabase-helpers';
import { escapeIlikePattern } from '../shared/postgrest-filter.util';
import {
  persistWorkflowSet,
  deleteWorkflowSetById,
  type WorkflowSetPayload,
} from './workflow-crud.util';
import {
  getAllUsers,
  getUserById,
  getAllRoles,
  getAllTasks,
  getAllWorkflowSets,
  getAllArchetypesConfig,
  getAllHospitalUnitsConfig,
  getAllProjectPriorities,
} from '../project-list/master-data.loader';

/** Kunci slice sama dengan payload ConfigurationPage di frontend. */
export const CONFIGURATION_SLICE_KEYS = [
  'users',
  'roles',
  'archetypes',
  'hospitalUnits',
  'regionals',
  'tasks',
  'workflows',
  'assetTypeConfigs',
  'assetTypeGroups',
  'budgetCategories',
  'projectPriorities',
  'masterCatalogue',
  'rooms',
  'vendors',
  'allPeriods',
  'assetTags',
] as const;

export type ConfigurationSliceKey = (typeof CONFIGURATION_SLICE_KEYS)[number];

const SLICE_SET = new Set<string>(CONFIGURATION_SLICE_KEYS);

function buildBudgetPeriodSummaries(periodRows: any[]): any[] {
  if (!periodRows?.length) return [];
  return periodRows.map((period) => {
    const camel = toCamelCase(period) as Record<string, unknown>;
    return {
      periodName: String(camel.periodName ?? ''),
      multiYearName: String(camel.multiYearName ?? ''),
      startDate: String(camel.startDate ?? ''),
      endDate: String(camel.endDate ?? ''),
      budget: {},
      archetypes: [],
    };
  });
}

async function getAllRegionalsConfig(client: SupabaseClient): Promise<any[]> {
  const data = await fetchAllRecords(client, 'regionals_config', '*');
  return data?.length ? data.map(toCamelCase) : [];
}

async function getAllBudgetCategories(client: SupabaseClient): Promise<any[]> {
  const data = await fetchAllRecords(client, 'budget_category_configs', '*');
  return data?.length ? data.map(toCamelCase) : [];
}

async function getAllAssetTypeConfigs(client: SupabaseClient): Promise<any[]> {
  const data = await fetchAllRecords(client, 'asset_type_configs', '*');
  return data?.length ? data.map(toCamelCase) : [];
}

async function getAllAssetTypeGroups(client: SupabaseClient): Promise<any[]> {
  const data = await fetchAllRecords(client, 'asset_type_groups', '*');
  return data?.length ? data.map(toCamelCase) : [];
}

async function getAllMasterCatalogue(client: SupabaseClient): Promise<any[]> {
  const data = await fetchAllRecords(client, 'master_catalogue', '*');
  return data?.length ? data.map(toCamelCase) : [];
}

async function getAllRoomsConfig(client: SupabaseClient): Promise<any[]> {
  const data = await fetchAllRecords(client, 'rooms_config', '*');
  return data?.length ? data.map(toCamelCase) : [];
}

const VENDOR_LIST_COLUMNS =
  'id,name,address,contact_person,contact_email,contact_phone,npwp';

async function getAllVendors(client: SupabaseClient): Promise<any[]> {
  const data = await fetchAllRecords(client, 'vendors', VENDOR_LIST_COLUMNS);
  return data?.length ? data.map(toCamelCase) : [];
}

async function getAllAssetTags(client: SupabaseClient): Promise<any[]> {
  const data = await fetchAllRecords(client, 'asset_tags', '*');
  return data?.length ? data.map(toCamelCase) : [];
}

type LoaderFn = (client: SupabaseClient) => Promise<unknown>;

type CrudEntityKey =
  | 'user'
  | 'role'
  | 'budgetCategory'
  | 'projectPriority'
  | 'assetTag'
  | 'regional'
  | 'archetype'
  | 'hospitalUnit'
  | 'task'
  | 'masterCatalogue'
  | 'room'
  | 'vendor'
  | 'appConfig'
  | 'assetTypeConfig'
  | 'assetTypeGroup'
  | 'workflowSet';

type CrudSpec = {
  table: string;
  keyColumn?: string;
  onConflict?: string;
};

const CRUD_ENTITY_MAP: Partial<Record<CrudEntityKey, CrudSpec>> = {
  user: { table: 'users' },
  role: { table: 'roles' },
  budgetCategory: { table: 'budget_category_configs' },
  projectPriority: { table: 'project_priority_configs' },
  assetTag: { table: 'asset_tags' },
  regional: { table: 'regionals_config' },
  archetype: { table: 'archetypes_config' },
  hospitalUnit: { table: 'hospital_units_config' },
  task: { table: 'tasks' },
  masterCatalogue: { table: 'master_catalogue' },
  room: { table: 'rooms_config' },
  vendor: { table: 'vendors' },
  appConfig: { table: 'app_config', keyColumn: 'key', onConflict: 'key' },
  assetTypeConfig: { table: 'asset_type_configs' },
  assetTypeGroup: { table: 'asset_type_groups' },
};

type ScopeRow = {
  user_assignment_id: number;
  scope_type: 'All' | 'Archetype' | 'HospitalUnit';
  scope_id: string;
};

/** Sama logika dengan FE db-supabase: ID canonical, fallback lookup name/code di master. */
async function buildScopeRow(
  client: SupabaseClient,
  userAssignmentId: number,
  rawScope: string,
): Promise<ScopeRow | null> {
  const scope = String(rawScope ?? '').trim();
  if (!scope) return null;
  if (scope === 'All' || scope.toLowerCase() === 'all') {
    return { user_assignment_id: userAssignmentId, scope_type: 'All', scope_id: 'All' };
  }
  if (scope.startsWith('ARCH-')) {
    return { user_assignment_id: userAssignmentId, scope_type: 'Archetype', scope_id: scope };
  }
  if (scope.startsWith('HU-')) {
    return { user_assignment_id: userAssignmentId, scope_type: 'HospitalUnit', scope_id: scope };
  }

  const { data: archById } = await client.from('archetypes_config').select('id').eq('id', scope).maybeSingle();
  if (archById?.id) {
    return { user_assignment_id: userAssignmentId, scope_type: 'Archetype', scope_id: String(archById.id) };
  }
  const { data: huById } = await client.from('hospital_units_config').select('id').eq('id', scope).maybeSingle();
  if (huById?.id) {
    return { user_assignment_id: userAssignmentId, scope_type: 'HospitalUnit', scope_id: String(huById.id) };
  }

  const { data: archByName } = await client.from('archetypes_config').select('id').eq('name', scope).maybeSingle();
  const arch =
    archByName ??
    (await client.from('archetypes_config').select('id').eq('code', scope).maybeSingle()).data;
  if (arch?.id) {
    return { user_assignment_id: userAssignmentId, scope_type: 'Archetype', scope_id: String(arch.id) };
  }

  const { data: huByName } = await client.from('hospital_units_config').select('id').eq('name', scope).maybeSingle();
  const hu =
    huByName ??
    (await client.from('hospital_units_config').select('id').eq('code', scope).maybeSingle()).data;
  if (hu?.id) {
    return { user_assignment_id: userAssignmentId, scope_type: 'HospitalUnit', scope_id: String(hu.id) };
  }

  return null;
}

function camelToSnakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

function camelToSnakeObject(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(input).forEach(([k, v]) => {
    out[camelToSnakeKey(k)] = v;
  });
  return out;
}

/**
 * `tasks` table has `trigger_event` (varchar), not `trigger_events`.
 * Normalize multi-event UI payloads into the persisted column.
 */
function normalizeTaskSnakePayload(snakePayload: Record<string, unknown>): Record<string, unknown> {
  const out = { ...snakePayload };
  const fromArray = Array.isArray(out.trigger_events)
    ? (out.trigger_events as unknown[]).map((e) => String(e ?? '').trim()).filter(Boolean)
    : [];
  const fromSingular = String(out.trigger_event ?? '')
    .split(/[|,]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const events = [...new Set(fromArray.length > 0 ? fromArray : fromSingular)];
  delete out.trigger_events;
  if (out.is_system_triggered) {
    out.trigger_event = events.length > 0 ? events.join('|') : null;
  } else {
    out.trigger_event = null;
  }
  return out;
}

const SLICE_LOADERS: Record<ConfigurationSliceKey, LoaderFn> = {
  users: (c) => getAllUsers(c),
  roles: (c) => getAllRoles(c),
  archetypes: (c) => getAllArchetypesConfig(c),
  hospitalUnits: (c) => getAllHospitalUnitsConfig(c),
  regionals: (c) => getAllRegionalsConfig(c),
  tasks: (c) => getAllTasks(c),
  workflows: (c) => getAllWorkflowSets(c),
  assetTypeConfigs: (c) => getAllAssetTypeConfigs(c),
  assetTypeGroups: (c) => getAllAssetTypeGroups(c),
  budgetCategories: (c) => getAllBudgetCategories(c),
  projectPriorities: (c) => getAllProjectPriorities(c),
  masterCatalogue: (c) => getAllMasterCatalogue(c),
  rooms: (c) => getAllRoomsConfig(c),
  vendors: (c) => getAllVendors(c),
  allPeriods: async (c) => {
    const rows = await fetchAllRecords(
      c,
      'budget_periods',
      'period_name,multi_year_name,start_date,end_date',
    );
    return buildBudgetPeriodSummaries(rows);
  },
  assetTags: (c) => getAllAssetTags(c),
};

const MAX_INT4_ROLE_ID = 2_147_483_647;
const MAX_INT4_ID = 2_147_483_647;

const CRUD_SLICE_INVALIDATION: Partial<Record<CrudEntityKey, ConfigurationSliceKey[]>> = {
  user: ['users'],
  role: ['roles', 'users'],
  budgetCategory: ['budgetCategories'],
  projectPriority: ['projectPriorities'],
  assetTag: ['assetTags'],
  regional: ['regionals'],
  archetype: ['archetypes'],
  hospitalUnit: ['hospitalUnits'],
  task: ['tasks'],
  masterCatalogue: ['masterCatalogue'],
  room: ['rooms'],
  vendor: ['vendors'],
  assetTypeConfig: ['assetTypeConfigs'],
  assetTypeGroup: ['assetTypeGroups', 'assetTypeConfigs'],
  workflowSet: ['workflows'],
};

@Injectable()
export class ConfigurationService {
  constructor(private readonly authZ: AuthZService) {}

  private readonly responseCache = new Map<string, { expiresAt: number; data: unknown }>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  private pruneCache(): void {
    const now = Date.now();
    for (const [k, v] of this.responseCache.entries()) {
      if (v.expiresAt <= now) this.responseCache.delete(k);
    }
  }

  private getFromProcessCache<T>(key: string): T | null {
    this.pruneCache();
    const hit = this.responseCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.data as T;
    return null;
  }

  private setProcessCache(key: string, data: unknown, ttlMs: number): void {
    this.responseCache.set(key, { expiresAt: Date.now() + ttlMs, data });
  }

  private async dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = run();
    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }

  async invalidateSlices(userId: number, slices: ConfigurationSliceKey[]): Promise<void> {
    const unique = [...new Set(slices)];
    for (const slice of unique) {
      const key = cacheKeys.configurationSlice(userId, slice);
      this.responseCache.delete(key);
      this.inflight.delete(key);
      await perfCacheDelete(key);
    }
    await perfCacheDeleteByPrefix(`app:table:configuration:slice:${userId}:`);
  }

  private async invalidateForCrudEntity(userId: number, entity: CrudEntityKey): Promise<void> {
    const slices = CRUD_SLICE_INVALIDATION[entity];
    if (slices?.length) await this.invalidateSlices(userId, slices);
  }

  private isPkConflict(error: unknown, constraintName: string): boolean {
    const e = error as { code?: string; message?: string } | null | undefined;
    return e?.code === '23505' && String(e?.message ?? '').includes(constraintName);
  }

  private async getNextIntId(client: SupabaseClient, table: string): Promise<number> {
    const { data, error } = await client
      .from(table)
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    const next = Number(data?.id ?? 0) + 1;
    if (!Number.isFinite(next) || next <= 0 || next > MAX_INT4_ID) {
      throw new BadRequestException(`Unable to allocate id for ${table}`);
    }
    return next;
  }

  private async insertUserAssignmentWithRecovery(
    client: SupabaseClient,
    payload: { user_id: number; role_id: number },
  ): Promise<{ id: number }> {
    let res = await client.from('user_assignments').insert(payload).select('id').maybeSingle();
    if (!res.error && res.data?.id) return { id: Number(res.data.id) };

    if (this.isPkConflict(res.error, 'user_assignments_pkey')) {
      const nextId = await this.getNextIntId(client, 'user_assignments');
      res = await client
        .from('user_assignments')
        .insert({ ...payload, id: nextId })
        .select('id')
        .maybeSingle();
      if (!res.error && res.data?.id) return { id: Number(res.data.id) };
    }

    throw new BadRequestException(res.error?.message || 'Failed to save assignment');
  }

  private async insertUserAssignmentScopesWithRecovery(
    client: SupabaseClient,
    rows: ScopeRow[],
  ): Promise<void> {
    if (!rows.length) return;
    let res = await client.from('user_assignment_scopes').insert(rows);
    if (!res.error) return;

    if (this.isPkConflict(res.error, 'user_assignment_scopes_pkey')) {
      let nextId = await this.getNextIntId(client, 'user_assignment_scopes');
      const withIds = rows.map((r) => ({ ...r, id: nextId++ }));
      res = await client.from('user_assignment_scopes').insert(withIds as any[]);
      if (!res.error) return;
    }

    throw new BadRequestException(res.error?.message || 'Failed to save assignment scopes');
  }

  private async assertConfigAccess(accessToken: string, userId: number) {
    return this.authZ.assertConfigurationAccess(accessToken, userId);
  }

  /**
   * Configuration access is authorized in BE (role check), then executed with
   * service role to avoid RLS-dependent empty reads for users/roles management.
   */
  private getConfigurationClient(fallbackClient: SupabaseClient): SupabaseClient {
    const serviceKey = getSupabaseServiceKey();
    if (!serviceKey) return fallbackClient;
    return createSupabaseClient(serviceKey);
  }

  private async allocateNextRoleId(client: SupabaseClient): Promise<number> {
    const { data, error } = await client
      .from('roles')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    const next = Number(data?.id ?? 0) + 1;
    if (!Number.isFinite(next) || next <= 0 || next > MAX_INT4_ROLE_ID) {
      throw new BadRequestException('Unable to allocate role id');
    }
    return next;
  }

  private async saveRoleEntity(client: SupabaseClient, payload: Record<string, unknown>) {
    let roleId = Number(payload.id);
    const roleName = String(payload.roleName ?? '').trim();
    if (!roleName) {
      throw new BadRequestException('Invalid role payload');
    }
    if (!Number.isFinite(roleId) || roleId <= 0 || roleId > MAX_INT4_ROLE_ID) {
      roleId = await this.allocateNextRoleId(client);
    }
    const permissions = Array.isArray(payload.permissions) ? payload.permissions : [];

    const { data: roleRows, error: roleErr } = await client
      .from('roles')
      .upsert({ id: roleId, role_name: roleName })
      .select('*');
    if (roleErr) throw new BadRequestException(roleErr.message);

    const { error: delPermErr } = await client.from('role_permissions').delete().eq('role_id', roleId);
    if (delPermErr) throw new BadRequestException(delPermErr.message);

    const permissionRows = permissions
      .map((p: any) => ({
        role_id: roleId,
        hierarchy: String(p?.hierarchy ?? '').trim(),
        permission: String(p?.permission ?? '').trim(),
      }))
      .filter((p) => p.hierarchy && p.permission);
    if (permissionRows.length > 0) {
      const { error: insPermErr } = await client.from('role_permissions').insert(permissionRows);
      if (insPermErr) throw new BadRequestException(insPermErr.message);
    }

    return roleRows?.[0] ? toCamelCase(roleRows[0]) : { id: roleId, roleName };
  }

  private async saveUserEntity(client: SupabaseClient, payload: Record<string, unknown>) {
    const userId = Number(payload.id);
    const username = String(payload.username ?? '').trim();
    const email = String(payload.email ?? '').trim();
    if (!Number.isFinite(userId) || userId <= 0 || !username || !email) {
      throw new BadRequestException('Invalid user payload');
    }
    const assignments = Array.isArray(payload.assignments) ? payload.assignments : [];

    const userRow = {
      id: userId,
      username,
      email,
      phone_number: payload.phoneNumber ?? null,
      auth_id: payload.authId ?? null,
    };
    const { data: userRows, error: userErr } = await client.from('users').upsert(userRow).select('*');
    if (userErr) throw new BadRequestException(userErr.message);

    const { data: existingAssignments, error: uaListErr } = await client
      .from('user_assignments')
      .select('id')
      .eq('user_id', userId);
    if (uaListErr) throw new BadRequestException(uaListErr.message);
    const assignmentIds = (existingAssignments ?? []).map((a: any) => Number(a.id)).filter(Number.isFinite);
    if (assignmentIds.length > 0) {
      const { error: delScopeErr } = await client
        .from('user_assignment_scopes')
        .delete()
        .in('user_assignment_id', assignmentIds);
      if (delScopeErr) throw new BadRequestException(delScopeErr.message);
    }
    const { error: delUaErr } = await client.from('user_assignments').delete().eq('user_id', userId);
    if (delUaErr) throw new BadRequestException(delUaErr.message);

    for (const a of assignments) {
      const roleName = String((a as any)?.roleName ?? '').trim();
      const roleId = Number((a as any)?.roleId);
      if (!roleName && !Number.isFinite(roleId)) continue;
      let resolvedRoleId: number | null = Number.isFinite(roleId) && roleId > 0 ? roleId : null;
      if (!resolvedRoleId) {
        const { data: roleRows, error: roleErr } = await client
          .from('roles')
          .select('id, role_name')
          .ilike('role_name', escapeIlikePattern(roleName));
        if (roleErr) throw new BadRequestException(roleErr.message);
        const exactRole = (roleRows ?? []).find(
          (r: any) =>
            String(r?.role_name ?? '')
              .trim()
              .toLowerCase() === roleName.toLowerCase(),
        );
        resolvedRoleId = Number(exactRole?.id);
      }
      if (!Number.isFinite(resolvedRoleId) || Number(resolvedRoleId) <= 0) {
        throw new BadRequestException(`Role not found for assignment: ${roleName || roleId}`);
      }

      const uaRow = await this.insertUserAssignmentWithRecovery(client, {
        user_id: userId,
        role_id: resolvedRoleId,
      });

      const scopes = Array.isArray((a as any)?.assignedScopes) ? (a as any).assignedScopes : [];
      const scopeRows: ScopeRow[] = [];
      for (const rawScope of scopes) {
        const row = await buildScopeRow(client, uaRow.id, String(rawScope ?? ''));
        if (row) scopeRows.push(row);
      }
      await this.insertUserAssignmentScopesWithRecovery(client, scopeRows);
    }

    const savedFull = await getUserById(client, userId);
    if (savedFull) return savedFull;
    return userRows?.[0] ? toCamelCase(userRows[0]) : { id: userId, username, email, assignments: [] };
  }

  /**
   * Satu round-trip HTTP: semua master config diparalel di server.
   * @param slices jika diisi, hanya key yang diminta (untuk refresh parsial).
   */
  async loadConfigurationPack(
    accessToken: string,
    userId: number,
    slices?: string[],
    skipCache = false,
  ) {
    if (!accessToken?.trim()) {
      throw new UnauthorizedException('Missing access token');
    }

    const ctx = await this.assertConfigAccess(accessToken, userId);
    const client = this.getConfigurationClient(ctx.client);

    const requested =
      slices?.length && slices.some(Boolean)
        ? [...new Set(slices.filter((s) => SLICE_SET.has(s)) as ConfigurationSliceKey[])]
        : [...CONFIGURATION_SLICE_KEYS];

    const out: Partial<Record<ConfigurationSliceKey, unknown>> = {};
    const toLoad: ConfigurationSliceKey[] = [];

    for (const key of requested) {
      if (!skipCache) {
        const cacheKey = cacheKeys.configurationSlice(userId, key);
        const processHit = this.getFromProcessCache<unknown>(cacheKey);
        if (processHit !== null) {
          out[key] = processHit;
          continue;
        }
        const sharedHit = await perfCacheGet<unknown>(cacheKey);
        if (sharedHit !== null) {
          const ttl = configurationSliceTtlMs(key);
          this.setProcessCache(cacheKey, sharedHit, ttl);
          out[key] = sharedHit;
          continue;
        }
      }
      toLoad.push(key);
    }

    if (toLoad.length) {
      const entries = await Promise.all(
        toLoad.map((key) =>
          this.dedupe(cacheKeys.configurationSlice(userId, key), async () => {
            const loader = SLICE_LOADERS[key];
            const value = await loader(client);
            const ttl = configurationSliceTtlMs(key);
            const cacheKey = cacheKeys.configurationSlice(userId, key);
            this.setProcessCache(cacheKey, value, ttl);
            await perfCacheSet(cacheKey, value, ttl);
            return [key, value] as const;
          }),
        ),
      );
      for (const entry of entries) {
        const [key, value] = entry as [ConfigurationSliceKey, unknown];
        out[key] = value;
      }
    }

    return out as Record<ConfigurationSliceKey, unknown>;
  }

  async saveConfigurationEntity(
    accessToken: string,
    userId: number,
    entity: CrudEntityKey,
    payload: Record<string, unknown>,
  ) {
    if (!accessToken?.trim()) {
      throw new UnauthorizedException('Missing access token');
    }
    if (entity !== 'workflowSet') {
      const spec = CRUD_ENTITY_MAP[entity];
      if (!spec) {
        throw new BadRequestException('Unsupported configuration entity');
      }
    }
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Invalid payload');
    }

    const ctx = await this.assertConfigAccess(accessToken, userId);
    const client = this.getConfigurationClient(ctx.client);

    if (entity === 'workflowSet') {
      const saved = await persistWorkflowSet(client, payload as WorkflowSetPayload);
      await this.invalidateForCrudEntity(userId, entity);
      return saved;
    }

    const spec = CRUD_ENTITY_MAP[entity]!;

    if (entity === 'role') {
      const saved = await this.saveRoleEntity(client, payload);
      await this.invalidateForCrudEntity(userId, entity);
      return saved;
    }
    if (entity === 'user') {
      const saved = await this.saveUserEntity(client, payload);
      await this.invalidateForCrudEntity(userId, entity);
      return saved;
    }

    const snakePayloadRaw = camelToSnakeObject(payload);
    const snakePayload =
      entity === 'task' ? normalizeTaskSnakePayload(snakePayloadRaw) : snakePayloadRaw;
    const req = spec.onConflict
      ? client.from(spec.table).upsert(snakePayload, { onConflict: spec.onConflict })
      : client.from(spec.table).upsert(snakePayload);
    const { data, error } = await req.select();
    if (error) {
      throw new BadRequestException(error.message);
    }
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    await this.invalidateForCrudEntity(userId, entity);
    if (entity === 'appConfig') {
      const configKey = cacheKeys.budgetHuConfig();
      this.responseCache.delete(configKey);
      this.inflight.delete(configKey);
      await perfCacheDelete(configKey);
    }
    return row ? toCamelCase(row) : null;
  }

  /**
   * Count assets referencing a configuration asset type (canonical asset_type_id).
   */
  async getAssetTypeUsageCount(
    accessToken: string,
    userId: number,
    assetTypeId: string,
  ): Promise<{ count: number }> {
    const id = String(assetTypeId ?? '').trim();
    if (!id) {
      throw new BadRequestException('assetTypeId is required');
    }

    const ctx = await this.assertConfigAccess(accessToken, userId);
    const client = this.getConfigurationClient(ctx.client);

    const { count, error } = await client
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .eq('asset_type_id', id);
    if (error) {
      throw new BadRequestException(error.message);
    }

    return { count: count ?? 0 };
  }

  /**
   * Reassign assets from one asset type to another (delete-with-migration flow).
   * Updates asset_type_id and workflow_set_id from the target type config.
   */
  async migrateAssetTypeUsage(
    accessToken: string,
    userId: number,
    fromAssetTypeId: string,
    toAssetTypeId: string,
  ): Promise<{ updatedCount: number }> {
    const fromId = String(fromAssetTypeId ?? '').trim();
    const toId = String(toAssetTypeId ?? '').trim();
    if (!fromId || !toId) {
      throw new BadRequestException('fromAssetTypeId and toAssetTypeId are required');
    }
    if (fromId === toId) {
      return { updatedCount: 0 };
    }

    const ctx = await this.assertConfigAccess(accessToken, userId);
    const client = this.getConfigurationClient(ctx.client);

    const { data: targetType, error: targetErr } = await client
      .from('asset_type_configs')
      .select('id, workflow_set_id')
      .eq('id', toId)
      .maybeSingle();
    if (targetErr) {
      throw new BadRequestException(targetErr.message);
    }
    if (!targetType?.id) {
      throw new BadRequestException('Target asset type not found');
    }

    const targetWorkflowSetId = String(targetType.workflow_set_id ?? '').trim();
    if (!targetWorkflowSetId) {
      throw new BadRequestException('Target asset type has no workflow');
    }

    const { count, error: countErr } = await client
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .eq('asset_type_id', fromId);
    if (countErr) {
      throw new BadRequestException(countErr.message);
    }

    const { error: updateErr } = await client
      .from('assets')
      .update({
        asset_type_id: toId,
        workflow_set_id: targetWorkflowSetId,
      })
      .eq('asset_type_id', fromId);
    if (updateErr) {
      throw new BadRequestException(updateErr.message);
    }

    return { updatedCount: count ?? 0 };
  }

  /**
   * Bulk-update assets.workflow_set_id when deleting/migrating an asset type.
   * Uses service role after configuration RBAC — avoids scoped RLS on direct FE writes.
   * @deprecated Prefer migrateAssetTypeUsage — workflow-based migration affects unrelated assets.
   */
  async migrateAssetTypeWorkflow(
    accessToken: string,
    userId: number,
    fromWorkflowSetId: string,
    toWorkflowSetId: string,
  ): Promise<{ updatedCount: number }> {
    const from = String(fromWorkflowSetId ?? '').trim();
    const to = String(toWorkflowSetId ?? '').trim();
    if (!from || !to) {
      throw new BadRequestException('fromWorkflowSetId and toWorkflowSetId are required');
    }
    if (from === to) {
      return { updatedCount: 0 };
    }

    const ctx = await this.assertConfigAccess(accessToken, userId);
    const client = this.getConfigurationClient(ctx.client);

    const { count, error: countErr } = await client
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .eq('workflow_set_id', from);
    if (countErr) {
      throw new BadRequestException(countErr.message);
    }

    const { error: updateErr } = await client
      .from('assets')
      .update({ workflow_set_id: to })
      .eq('workflow_set_id', from);
    if (updateErr) {
      throw new BadRequestException(updateErr.message);
    }

    return { updatedCount: count ?? 0 };
  }

  async getAppConfigByKey(accessToken: string, userId: number, key: string) {
    const configKey = String(key ?? '').trim();
    if (!configKey) throw new BadRequestException('key is required');
    const ctx = await this.assertConfigAccess(accessToken, userId);
    const client = this.getConfigurationClient(ctx.client);
    const { data, error } = await client
      .from('app_config')
      .select('*')
      .eq('key', configKey)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    return { config: data ? toCamelCase(data) : null };
  }

  async deleteConfigurationEntity(
    accessToken: string,
    userId: number,
    entity: CrudEntityKey,
    id: string | number,
  ) {
    if (!accessToken?.trim()) {
      throw new UnauthorizedException('Missing access token');
    }
    if (entity !== 'workflowSet') {
      const spec = CRUD_ENTITY_MAP[entity];
      if (!spec) {
        throw new BadRequestException('Unsupported configuration entity');
      }
    }
    const keyValue = typeof id === 'number' ? id : String(id ?? '').trim();
    if (keyValue === '') {
      throw new BadRequestException('Invalid id');
    }

    const ctx = await this.assertConfigAccess(accessToken, userId);
    const client = this.getConfigurationClient(ctx.client);

    if (entity === 'workflowSet') {
      await deleteWorkflowSetById(client, String(id));
      await this.invalidateForCrudEntity(userId, entity);
      return { success: true };
    }

    const spec = CRUD_ENTITY_MAP[entity]!;
    const keyColumn = spec.keyColumn || 'id';

    if (entity === 'role') {
      const roleId = Number(id);
      if (!Number.isFinite(roleId) || roleId <= 0) throw new BadRequestException('Invalid id');
      const { error } = await client.from('roles').delete().eq('id', roleId);
      if (error) throw new BadRequestException(error.message);
      await this.invalidateForCrudEntity(userId, entity);
      return { success: true };
    }
    if (entity === 'user') {
      const userEntityId = Number(id);
      if (!Number.isFinite(userEntityId) || userEntityId <= 0) throw new BadRequestException('Invalid id');
      const { error } = await client.from('users').delete().eq('id', userEntityId);
      if (error) throw new BadRequestException(error.message);
      await this.invalidateForCrudEntity(userId, entity);
      return { success: true };
    }

    const { error } = await client.from(spec.table).delete().eq(keyColumn, keyValue);
    if (error) {
      throw new BadRequestException(error.message);
    }
    await this.invalidateForCrudEntity(userId, entity);
    return { success: true };
  }
}
