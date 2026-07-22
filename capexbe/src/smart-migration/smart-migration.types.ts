export interface SmartMigrationMeta {
  target: string;
  periodName?: string | null;
  mapping: Record<string, string>;
  userId: number;
  /** Ignored by backend — actor is resolved from JWT userId. */
  currentUser?: { id: number; username: string };
  selectedAssetTypeId?: string;
  /** Client-generated id — dipakai polling progres real-time selama execute. */
  jobId?: string;
}

export type { MigrationProgressDto, MigrationProgressStage } from './migration-progress.util';

export interface MigrationResultPayload {
  success: boolean;
  totalRows: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  successCount: number;
  failedCount: number;
  errors: string[];
  warnings: string[];
  taskLogsBatch?: unknown[];
  assetTaskStatusesBatch?: unknown[];
}
