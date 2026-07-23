import { BadRequestException, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthZService } from '../auth/auth-z.service';
import {
  getAllArchetypesConfig,
  getAllHospitalUnitsConfig,
  getAllUsers,
} from '../project-list/master-data.loader';
import { resolveAuthoritativeProjectListScope } from '../project-list/project-list-query.util';
import { CACHE_TTL_MS, cacheKeys } from '../shared/cache-keys';
import { perfCacheGet, perfCacheSet } from '../shared/perf-cache';

const MOM_SUMMARY_COLUMNS =
  'id,asset_id,content,created_at,created_by_user_id,created_by_username';
const ASSET_LOOKUP_SELECT = 'id,asset_code,asset_name,project_id';
const PROJECT_LOOKUP_SELECT = 'id,project_code,project_name,hospital_unit_id,period_name';
const ID_CHUNK = 120;

type MomRow = {
  mom: Record<string, unknown>;
  assetCode: string;
  assetName: string;
  projectCode: string;
  projectName: string;
  archetypeName: string;
  huName: string;
};

type AssetContext = Omit<MomRow, 'mom'>;

async function fetchAssetsByIds(client: SupabaseClient, assetIds: string[]): Promise<any[]> {
  const unique = [...new Set(assetIds.map((id) => String(id).trim()))].filter(Boolean);
  if (!unique.length) return [];
  const out: any[] = [];
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const chunk = unique.slice(i, i + ID_CHUNK);
    const { data, error } = await client.from('assets').select(ASSET_LOOKUP_SELECT).in('id', chunk);
    if (error) throw new BadRequestException(`assets lookup: ${error.message}`);
    if (data?.length) out.push(...data);
  }
  return out;
}

async function fetchProjectsInPeriodByIds(
  client: SupabaseClient,
  projectIds: string[],
  periodName: string,
): Promise<any[]> {
  const unique = [...new Set(projectIds.map((id) => String(id).trim()))].filter(Boolean);
  if (!unique.length) return [];
  const pn = periodName.trim();
  const out: any[] = [];
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const chunk = unique.slice(i, i + ID_CHUNK);
    const { data, error } = await client
      .from('projects')
      .select(PROJECT_LOOKUP_SELECT)
      .in('id', chunk)
      .eq('period_name', pn);
    if (error) throw new BadRequestException(`projects lookup: ${error.message}`);
    if (data?.length) out.push(...data);
  }
  return out;
}

@Injectable()
export class MomDailySummaryService {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly authZ: AuthZService,
  ) {}

  private localDayBoundsIso(yyyyMmDd: string): { startIso: string; endIso: string } {
    const parts = yyyyMmDd.split('-').map((p) => parseInt(p, 10));
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (!y || !m || !d) {
      const now = new Date();
      return this.localDayBoundsIso(now.toISOString().slice(0, 10));
    }
    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(y, m - 1, d, 23, 59, 59, 999);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }

  private buildAssetContextMap(
    assets: any[],
    projects: any[],
    hus: any[],
    archetypes: any[],
  ): Map<string, AssetContext> {
    const projectById = new Map(projects.map((p) => [String(p.id), p]));
    const huById = new Map(
      hus.map((hu) => [
        String(hu.id),
        {
          name: String(hu.name ?? ''),
          archetypeId: String(hu.archetypeId ?? hu.archetype_id ?? ''),
        },
      ]),
    );
    const archById = new Map(archetypes.map((a) => [String(a.id), String(a.name ?? '')]));

    const map = new Map<string, AssetContext>();
    for (const asset of assets) {
      const assetId = String(asset.id ?? '');
      const project = projectById.get(String(asset.project_id ?? asset.projectId ?? ''));
      if (!project) continue;

      const hu = huById.get(String(project.hospital_unit_id ?? project.hospitalUnitId ?? ''));
      const archetypeName = hu?.archetypeId ? (archById.get(hu.archetypeId) ?? '') : '';

      map.set(assetId, {
        assetCode: String(asset.asset_code ?? asset.assetCode ?? ''),
        assetName: String(asset.asset_name ?? asset.assetName ?? ''),
        projectCode: String(project.project_code ?? project.projectCode ?? ''),
        projectName: String(project.project_name ?? project.projectName ?? ''),
        archetypeName,
        huName: hu?.name ?? '',
      });
    }
    return map;
  }

  private async loadSummaryUncached(
    client: SupabaseClient,
    userId: number,
    periodName: string,
    summaryDate: string,
    scopeAllOverride?: boolean,
  ): Promise<{ rows: MomRow[] }> {
    const { startIso, endIso } = this.localDayBoundsIso(summaryDate);
    const { data: moms, error } = await client
      .from('moms')
      .select(MOM_SUMMARY_COLUMNS)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);

    const momRows = moms || [];
    if (momRows.length === 0) {
      return { rows: [] };
    }

    const assetIds = [...new Set(momRows.map((row) => String(row.asset_id ?? '')).filter(Boolean))];

    const [archetypes, hus, users, assets] = await Promise.all([
      getAllArchetypesConfig(client),
      getAllHospitalUnitsConfig(client),
      getAllUsers(client),
      fetchAssetsByIds(client, assetIds),
    ]);

    const projectIds = [
      ...new Set(assets.map((a) => String(a.project_id ?? a.projectId ?? '')).filter(Boolean)),
    ];
    const projects = await fetchProjectsInPeriodByIds(client, projectIds, periodName);

    const serverScope = await resolveAuthoritativeProjectListScope(client, userId, {
      users,
      archetypes,
      hus,
    });
    const scopeAll = serverScope.scopeAll || scopeAllOverride === true;
    const scopeHus = new Set(serverScope.scopeHuNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
    const scopeArchetypes = new Set(
      serverScope.scopeArchetypeNames.map((n) => n.trim().toLowerCase()).filter(Boolean),
    );

    const contextMap = this.buildAssetContextMap(assets, projects, hus, archetypes);

    const rows: MomRow[] = [];
    for (const row of momRows) {
      const assetId = String(row.asset_id ?? '');
      const ctx = contextMap.get(assetId);
      if (!ctx) continue;
      if (!scopeAll) {
        const inHu = scopeHus.has(ctx.huName.trim().toLowerCase());
        const inArch = scopeArchetypes.has(ctx.archetypeName.trim().toLowerCase());
        if (!inHu && !inArch) continue;
      }
      rows.push({
        mom: {
          id: row.id,
          assetId,
          content: row.content,
          createdAt: row.created_at,
          createdByUserId: row.created_by_user_id,
          createdByUsername: row.created_by_username,
        },
        ...ctx,
      });
    }

    return { rows };
  }

  async loadSummary(accessToken: string, body: unknown) {
    const b = (body ?? {}) as {
      userId?: number;
      periodName?: string;
      summaryDate?: string;
      scopeAll?: boolean;
      skipCache?: boolean;
    };
    const userId = Number(b.userId);
    if (!Number.isFinite(userId)) throw new BadRequestException('Invalid userId');
    const periodName = String(b.periodName ?? '').trim();
    const summaryDate = String(b.summaryDate ?? '').trim();
    if (!periodName) throw new BadRequestException('periodName is required');
    if (!summaryDate) throw new BadRequestException('summaryDate is required');

    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Daily MOM Summary', 'view');

    const cacheKey = cacheKeys.momDailySummary(userId, periodName, summaryDate);
    if (b.skipCache !== true) {
      const cached = await perfCacheGet<{ rows: MomRow[] }>(cacheKey);
      if (cached) return cached;
    }

    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    const payload = await this.loadSummaryUncached(
      client,
      userId,
      periodName,
      summaryDate,
      b.scopeAll === true,
    );
    await perfCacheSet(cacheKey, payload, CACHE_TTL_MS.TABLE);
    return payload;
  }
}
