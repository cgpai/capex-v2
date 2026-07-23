import { Injectable, UnauthorizedException } from '@nestjs/common';
import { fetchAllRecords } from '../project-list/supabase-helpers';
import { getAllRoles, getAllUsers } from '../project-list/master-data.loader';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthZService } from '../auth/auth-z.service';
import {
  buildMultiYearsShellFromRows,
  buildPeriodSummariesFromRows,
} from '../budget-multi-year/budget-multi-year.util';
import { viewerCanLoadUserDirectory, viewerCanSeeUserPii } from '../shared/pii-access.util';
import { sanitizeRolesForViewer } from '../shared/bootstrap-sanitize.util';
import { sanitizeUsersForDirectory } from '../shared/response-sanitize.util';
import { getUserById } from '../project-list/master-data.loader';

const PERIOD_SUMMARY_COLUMNS = 'period_name,multi_year_name,start_date,end_date';
const MULTI_YEAR_COLUMNS = 'name,start_year,end_year,budget_plan';

@Injectable()
export class BootstrapService {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly authZ: AuthZService,
  ) {}

  /**
   * Satu round-trip HTTP: users, roles, multi-year, ringkasan periode — semua query paralel di server.
   * Membutuhkan JWT (backend atau Supabase legacy) + userId aplikasi yang cocok dengan identitas JWT.
   */
  async loadAppInitPack(accessToken: string, userId: number) {
    if (!accessToken?.trim()) {
      throw new UnauthorizedException('Missing access token');
    }
    const { client } = await this.authContext.getRlsClient(accessToken, userId);

    const [canLoadDirectory, includePii] = await Promise.all([
      viewerCanLoadUserDirectory(this.authZ, accessToken, userId),
      viewerCanSeeUserPii(this.authZ, accessToken, userId),
    ]);

    const usersPromise = canLoadDirectory
      ? getAllUsers(client)
      : getUserById(client, userId).then((u) => (u ? [u] : []));

    const [users, roles, multiYearRows, periodRows] = await Promise.all([
      usersPromise,
      getAllRoles(client),
      fetchAllRecords(client, 'budget_multi_years', MULTI_YEAR_COLUMNS),
      fetchAllRecords(client, 'budget_periods', PERIOD_SUMMARY_COLUMNS),
    ]);

    const sanitizedUsers = sanitizeUsersForDirectory(
      users as Record<string, unknown>[],
      userId,
      includePii,
    );
    const selfUser = sanitizedUsers.find((u) => Number(u.id) === Number(userId));
    const multiYears = buildMultiYearsShellFromRows(multiYearRows);
    const periodSummaries = buildPeriodSummariesFromRows(periodRows);

    return {
      users: sanitizedUsers,
      roles: sanitizeRolesForViewer(roles, selfUser?.assignments),
      multiYears,
      periodSummaries,
    };
  }
}
