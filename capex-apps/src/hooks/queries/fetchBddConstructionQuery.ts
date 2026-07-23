import { fetchCapexProjectListQuery } from '@/hooks/queries/fetchCapexProjectListQuery';
import type { ProjectListQueryParams } from '@/services/projectListQueryTypes';
import * as configService from '@/services/configService';
import type { BddConstructionTableBundle } from '@/lib/bddConstructionDiskCache';
import { withRequestCache } from '@/lib/requestCache';

const BDD_TAGS_CACHE_TTL_MS = 30 * 60 * 1000;

export async function fetchBddConstructionQueryPage(
  params: ProjectListQueryParams,
  accessToken?: string | null,
): Promise<BddConstructionTableBundle> {
  const [result, tags] = await Promise.all([
    fetchCapexProjectListQuery(
      {
        ...params,
        bddConstructionOnly: true,
      },
      accessToken,
    ),
    withRequestCache(
      'app:master:bdd-construction:tags',
      () => configService.getAllAssetTags(),
      BDD_TAGS_CACHE_TTL_MS,
    ),
  ]);
  return {
    ...result,
    tags,
  };
}
