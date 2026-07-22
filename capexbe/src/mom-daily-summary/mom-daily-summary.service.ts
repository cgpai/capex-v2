import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthZService } from '../auth/auth-z.service';
import { loadBudgetByPeriodName } from '../budget-hu/budget-period.loader';
import {
  getAllArchetypesConfig,
  getAllHospitalUnitsConfig,
  getAllUsers,
} from '../project-list/master-data.loader';
import { resolveAuthoritativeProjectListScope } from '../project-list/project-list-query.util';

const MOM_SUMMARY_COLUMNS =
  'id,asset_id,content,created_at,created_by_user_id,created_by_username';

type MomRow = {
  mom: Record<string, unknown>;
  assetCode: string;
  assetName: string;
  projectCode: string;
  projectName: string;
  archetypeName: string;
  huName: string;
};

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

  private buildAssetContextMap(period: any): Map<string, Omit<MomRow, 'mom'>> {
    const map = new Map<string, Omit<MomRow, 'mom'>>();
    for (const arch of period?.archetypes || []) {
      for (const unit of arch.units || []) {
        for (const proj of unit.projects || []) {
          for (const asset of proj.assets || []) {
            map.set(String(asset.id), {
              assetCode: String(asset.assetCode ?? asset.asset_code ?? ''),
              assetName: String(asset.assetName ?? asset.asset_name ?? ''),
              projectCode: String(proj.projectCode ?? proj.project_code ?? ''),
              projectName: String(proj.projectName ?? proj.project_name ?? ''),
              archetypeName: String(arch.name ?? ''),
              huName: String(unit.name ?? ''),
            });
          }
        }
      }
    }
    return map;
  }

  async loadSummary(accessToken: string, body: unknown) {
    const b = (body ?? {}) as {
      userId?: number;
      periodName?: string;
      summaryDate?: string;
      scopeAll?: boolean;
    };
    const userId = Number(b.userId);
    if (!Number.isFinite(userId)) throw new BadRequestException('Invalid userId');
    const periodName = String(b.periodName ?? '').trim();
    const summaryDate = String(b.summaryDate ?? '').trim();
    if (!periodName) throw new BadRequestException('periodName is required');
    if (!summaryDate) throw new BadRequestException('summaryDate is required');

    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Daily MOM Summary', 'view');

    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    const [period, archetypes, hus, users] = await Promise.all([
      loadBudgetByPeriodName(client, periodName),
      getAllArchetypesConfig(client),
      getAllHospitalUnitsConfig(client),
      getAllUsers(client),
    ]);
    if (!period) {
      return { rows: [] as MomRow[] };
    }

    const serverScope = await resolveAuthoritativeProjectListScope(client, userId, {
      users,
      archetypes,
      hus,
    });
    const scopeAll = serverScope.scopeAll || b.scopeAll === true;
    const scopeHus = new Set(serverScope.scopeHuNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
    const scopeArchetypes = new Set(
      serverScope.scopeArchetypeNames.map((n) => n.trim().toLowerCase()).filter(Boolean),
    );

    const contextMap = this.buildAssetContextMap(period);
    const { startIso, endIso } = this.localDayBoundsIso(summaryDate);
    const { data: moms, error } = await client
      .from('moms')
      .select(MOM_SUMMARY_COLUMNS)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);

    const rows: MomRow[] = [];
    for (const row of moms || []) {
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
}
