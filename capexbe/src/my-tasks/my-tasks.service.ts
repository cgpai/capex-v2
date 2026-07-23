import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthZService } from '../auth/auth-z.service';
import { getAllEnrichedAssetsForPeriod } from '../project-list/enriched-assets.loader';
import { getAllRoles, getAllTasks, getAllUsers, getAllWorkflowSets, getAllArchetypesConfig, getAllHospitalUnitsConfig } from '../project-list/master-data.loader';
import { fetchAllRecords, fetchAllRecordsWhereEq, fetchRecordsByAssetIds, normAssetTaskStatusRow, normTaskLogRow, toCamelCase } from '../project-list/supabase-helpers';
import { buildUserTasksSnapshot } from './build-user-tasks';
import { buildScopeResolutionMaps, userCanViewAllTasks } from './task-assignment-scope';
import { perfCacheDelete, perfCacheGet, perfCacheSet } from '../shared/perf-cache';

@Injectable()
export class MyTasksService {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly authZ: AuthZService,
  ) {}
  /** Align with FE TanStack staleTime — avoids cold reload on every 60s poll. */
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000;
  private readonly responseCache = new Map<string, { expiresAt: number; data: { tasks: any[] } }>();
  private readonly inflight = new Map<string, Promise<{ tasks: any[] }>>();

  private cacheKey(userId: number, periodName?: string): string {
    return `my-tasks:v2:${userId}::${(periodName || '').trim().toLowerCase()}`;
  }

  private pruneCache(): void {
    const now = Date.now();
    for (const [k, v] of this.responseCache.entries()) {
      if (v.expiresAt <= now) this.responseCache.delete(k);
    }
  }

  async loadMyTasks(accessToken: string, userId: number, periodName?: string, skipCache = false) {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'My Task', 'view');
    const key = this.cacheKey(userId, periodName);
    this.pruneCache();
    if (skipCache) {
      this.responseCache.delete(key);
      this.inflight.delete(key);
      await perfCacheDelete(key);
    }
    const cached = this.responseCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    const sharedCached = await perfCacheGet<{ tasks: any[] }>(key);
    if (sharedCached) {
      this.responseCache.set(key, {
        expiresAt: Date.now() + MyTasksService.CACHE_TTL_MS,
        data: sharedCached,
      });
      return sharedCached;
    }
    const existing = this.inflight.get(key);
    if (existing) {
      return existing;
    }

    const run = (async () => {
    const { client } = await this.authContext.getRlsClient(accessToken, userId);

    const [allUsers, allWorkflows, allRoles, allTasks, rawEnrichedAssets, archetypes, hus] = await Promise.all([
      getAllUsers(client),
      getAllWorkflowSets(client),
      getAllRoles(client),
      getAllTasks(client),
      getAllEnrichedAssetsForPeriod(client, periodName?.trim() || undefined),
      getAllArchetypesConfig(client),
      getAllHospitalUnitsConfig(client),
    ]);

    const userRow = allUsers.find((u: any) => Number(u.id) === Number(userId));
    if (!userRow) {
      throw new BadRequestException('User not found');
    }

    const userAssignments = userRow.assignments || [];
    const scopeMaps = buildScopeResolutionMaps(archetypes, hus);
    const viewAllTasks = userCanViewAllTasks(userAssignments);

    const adhocRaw = viewAllTasks
      ? await fetchAllRecords(client, 'adhoc_tasks', '*')
      : await fetchAllRecordsWhereEq(client, 'adhoc_tasks', 'assigned_to_user_id', userId);

    const adhocForUser = (adhocRaw || []).map((row: any) => toCamelCase(row));

    const periodAssetIds = rawEnrichedAssets.map((a: any) => String(a.id));
    const [allStatusesRaw, allTaskLogsRaw] = await Promise.all([
      fetchRecordsByAssetIds(client, 'asset_task_statuses', periodAssetIds),
      fetchRecordsByAssetIds(client, 'task_logs', periodAssetIds),
    ]);

    const allAssetStatuses = (allStatusesRaw || []).map(normAssetTaskStatusRow);
    const allTaskLogs = (allTaskLogsRaw || []).map(normTaskLogRow);

    const tasks = buildUserTasksSnapshot({
      userId,
      userAssignments,
      scopeMaps,
      allAssets: rawEnrichedAssets,
      allRoles,
      allWorkflows,
      allTasks,
      allAssetStatuses,
      allTaskLogs,
      adhocForUser,
    });

      const payload = { tasks };
      this.responseCache.set(key, {
        expiresAt: Date.now() + MyTasksService.CACHE_TTL_MS,
        data: payload,
      });
      await perfCacheSet(key, payload, MyTasksService.CACHE_TTL_MS);
      return payload;
    })();
    this.inflight.set(key, run);
    try {
      return await run;
    } finally {
      this.inflight.delete(key);
    }
  }

  /** Lightweight poll — reuses task cache when warm; avoids duplicate full builds when possible. */
  async loadOpenTaskCount(accessToken: string, userId: number, periodName?: string) {
    const data = await this.loadMyTasks(accessToken, userId, periodName, false);
    const openTasks = (data.tasks || []).filter(
      (t: { status?: string }) => String(t.status ?? '').toLowerCase() !== 'done',
    );
    return {
      openCount: openTasks.length,
      taskIds: openTasks.map((t: { id: string }) => String(t.id)),
    };
  }
}
