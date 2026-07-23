/** Must match capexbe PROJECT_LIST_DATA_POLICY — bump invalidates FE disk caches. */
export const PROJECT_LIST_DATA_POLICY = 'v8-slim-wire-payload';

export const PROJECT_LIST_DISK_CACHE_VERSION = 'capexProjectListTableCache:v2';

export type ProjectListPipelineDebug = {
  dataPolicy?: string;
  dbTruthCount?: number;
  dbMatchedCount?: number;
  afterProgressFilterCount?: number;
  returnedRowCount?: number;
  enrichDroppedCount?: number;
  cacheLayer?: string;
  defaultQuery?: boolean;
};

export function logProjectListPipelineStage(
  stage: string,
  payload: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_PROJECT_LIST_DEBUG !== '1') {
    return;
  }
  console.info(`[capex-project-list:${stage}]`, payload);
}

export function isStaleProjectListBundle(
  totalAssetCount: number | null | undefined,
  debug: ProjectListPipelineDebug | undefined,
): boolean {
  if (!debug?.defaultQuery) return false;
  if (debug.dataPolicy && debug.dataPolicy !== PROJECT_LIST_DATA_POLICY) return true;
  if (
    typeof debug.dbTruthCount === 'number' &&
    typeof totalAssetCount === 'number' &&
    totalAssetCount < debug.dbTruthCount
  ) {
    return true;
  }
  return false;
}
