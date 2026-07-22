import { fetchCapexProjectListQuery } from '@/hooks/queries/fetchCapexProjectListQuery';
import type { ProjectListQueryParams } from '@/services/projectListQueryTypes';
import * as configService from '@/services/configService';
import type { BddConstructionTableBundle } from '@/lib/bddConstructionDiskCache';

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
    configService.getAllAssetTags(),
  ]);
  return {
    ...result,
    tags,
  };
}
