import type { UserActivityMetric } from '@/types';
import {
  fetchUserMonitoringPageBundleFromBackend,
  fetchUserMonitoringUsersPageFromBackend,
} from '@/services/userMonitoringApi';

export type UserMonitoringBundle = {
  userData: UserActivityMetric[];
  roleData: never[];
};

export async function fetchUserMonitoringBundle(userId: number): Promise<UserMonitoringBundle> {
  const [bundle, page] = await Promise.all([
    fetchUserMonitoringPageBundleFromBackend(userId),
    fetchUserMonitoringUsersPageFromBackend({
      userId,
      page: 1,
      pageSize: 25,
      search: '',
      status: 'all',
      archetypeName: null,
      unitName: null,
    }),
  ]);
  if (page) {
    return { userData: page.rows, roleData: [] };
  }
  if (bundle) {
    return { userData: [], roleData: [] };
  }
  return { userData: [], roleData: [] };
}
