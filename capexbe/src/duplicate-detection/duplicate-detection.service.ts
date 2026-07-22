import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthZService } from '../auth/auth-z.service';
import { getAllHospitalUnitsConfig } from '../project-list/master-data.loader';
import { perfCacheGet, perfCacheSet } from '../shared/perf-cache';
import { normalizeSearchText } from './duplicate-detection.normalize';
import { parseDuplicateFetchBody, parseDuplicateSearchBody } from './duplicate-detection.dto';
import { mapDbAssetToDto, mapDbProjectToDto } from './duplicate-detection.mapper';
import { searchDuplicateAssets, searchDuplicateProjects } from './duplicate-detection.search';

const SEARCH_CACHE_TTL_MS = 60_000;

@Injectable()
export class DuplicateDetectionService {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly authZ: AuthZService,
  ) {}

  private cacheKey(
    entity: 'project' | 'asset',
    periodName: string,
    query: string,
    cursor: number,
    extra: string,
  ): string {
    const q = normalizeSearchText(query);
    return `dup:${entity}:${periodName.toLowerCase()}:${extra}:${q}:${cursor}`;
  }

  private async loadCategoryNames(client: SupabaseClient): Promise<Map<string, string>> {
    const { data, error } = await client.from('budget_category_configs').select('id, name');
    if (error) throw new InternalServerErrorException(error.message);
    const map = new Map<string, string>();
    for (const row of data || []) {
      map.set(String((row as { id: string }).id), String((row as { name: string }).name || ''));
    }
    return map;
  }

  private parseSearch(body: unknown) {
    try {
      return parseDuplicateSearchBody(body);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Invalid search request');
    }
  }

  async searchProjects(accessToken: string, body: unknown) {
    const parsed = this.parseSearch(body);
    await this.authZ.assertHierarchyPermission(accessToken, parsed.userId, 'Budget HU', 'view');
    const extra = `${parsed.huId ?? '_'}:${parsed.excludeId ?? '_'}`;
    const cacheKey = this.cacheKey('project', parsed.periodName, parsed.query, parsed.cursor, extra);
    const cached = await perfCacheGet<Awaited<ReturnType<typeof searchDuplicateProjects>>>(cacheKey);
    if (cached) return cached;

    const { client } = await this.authContext.resolve(accessToken, parsed.userId);
    const hus = await getAllHospitalUnitsConfig(client);
    const huNameById = new Map(hus.map((h) => [String(h.id), String(h.name)]));
    const result = await searchDuplicateProjects(
      client,
      {
        periodName: parsed.periodName,
        query: parsed.query,
        huId: parsed.huId,
        excludeId: parsed.excludeId,
        cursor: parsed.cursor,
        limit: parsed.limit,
      },
      huNameById,
    );
    await perfCacheSet(cacheKey, result, SEARCH_CACHE_TTL_MS);
    return result;
  }

  async searchAssets(accessToken: string, body: unknown) {
    const parsed = this.parseSearch(body);
    await this.authZ.assertHierarchyPermission(accessToken, parsed.userId, 'Budget HU', 'view');
    const extra = `${parsed.huId ?? '_'}:${parsed.projectId ?? '_'}:${parsed.excludeId ?? '_'}`;
    const cacheKey = this.cacheKey('asset', parsed.periodName, parsed.query, parsed.cursor, extra);
    const cached = await perfCacheGet<Awaited<ReturnType<typeof searchDuplicateAssets>>>(cacheKey);
    if (cached) return cached;

    const { client } = await this.authContext.resolve(accessToken, parsed.userId);
    const categoryNameById = await this.loadCategoryNames(client);
    const result = await searchDuplicateAssets(
      client,
      {
        periodName: parsed.periodName,
        query: parsed.query,
        huId: parsed.huId,
        projectId: parsed.projectId,
        excludeId: parsed.excludeId,
        cursor: parsed.cursor,
        limit: parsed.limit,
      },
      categoryNameById,
    );
    await perfCacheSet(cacheKey, result, SEARCH_CACHE_TTL_MS);
    return result;
  }

  async fetchProject(accessToken: string, body: unknown) {
    const parsed = parseDuplicateFetchBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, parsed.userId, 'Budget HU', 'view');
    const { client } = await this.authContext.resolve(accessToken, parsed.userId);

    const { data: project, error } = await client
      .from('projects')
      .select('*')
      .eq('id', parsed.id)
      .eq('period_name', parsed.periodName)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!project) throw new BadRequestException('Project not found');

    const { data: assets, error: assetErr } = await client
      .from('assets')
      .select('*')
      .eq('project_id', parsed.id);
    if (assetErr) throw new InternalServerErrorException(assetErr.message);

    const { data: pcbs } = await client
      .from('project_category_budgets')
      .select('budget_category_id, budget_plan')
      .eq('project_id', parsed.id);

    const categoryBudgetPlan: Record<string, number> = {};
    for (const pcb of pcbs || []) {
      categoryBudgetPlan[String((pcb as { budget_category_id: string }).budget_category_id)] = Number(
        (pcb as { budget_plan: number }).budget_plan ?? 0,
      );
    }

    const dto = mapDbProjectToDto(project as Record<string, unknown>, (assets || []) as Record<string, unknown>[]);
    if (Object.keys(categoryBudgetPlan).length > 0) {
      (dto as Record<string, unknown>).categoryBudgetPlan = categoryBudgetPlan;
    }
    return { project: dto };
  }

  async fetchAsset(accessToken: string, body: unknown) {
    const parsed = parseDuplicateFetchBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, parsed.userId, 'Budget HU', 'view');
    const { client } = await this.authContext.resolve(accessToken, parsed.userId);

    const { data: asset, error } = await client
      .from('assets')
      .select('*, projects!inner(period_name)')
      .eq('id', parsed.id)
      .eq('projects.period_name', parsed.periodName)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!asset) throw new BadRequestException('Asset not found');

    return { asset: mapDbAssetToDto(asset as Record<string, unknown>) };
  }
}
