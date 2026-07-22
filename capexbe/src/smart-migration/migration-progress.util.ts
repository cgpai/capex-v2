export type MigrationProgressStage =
  | 'preparing'
  | 'processing'
  | 'saving'
  | 'finalizing'
  | 'done'
  | 'error';

export type MigrationProgressDto = {
  stage: MigrationProgressStage;
  processedRows: number;
  totalRows: number;
  message?: string;
  partialSaveIndex?: number;
  savedCount?: number;
  failedCount?: number;
  updatedAt: number;
};

type MigrationProgressEntry = MigrationProgressDto & { ownerUserId: number };

const PROGRESS_TTL_MS = 15 * 60 * 1000;
const progressStore = new Map<string, MigrationProgressEntry>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [key, entry] of progressStore.entries()) {
    if (now - entry.updatedAt > PROGRESS_TTL_MS) {
      progressStore.delete(key);
    }
  }
}

export function setMigrationProgress(
  jobId: string,
  ownerUserId: number,
  progress: Omit<MigrationProgressDto, 'updatedAt'>,
): void {
  const id = String(jobId || '').trim();
  if (!id) return;
  if (!Number.isFinite(ownerUserId)) return;
  pruneExpired();
  progressStore.set(id, { ...progress, ownerUserId, updatedAt: Date.now() });
}

export function getMigrationProgress(
  jobId: string,
  ownerUserId: number,
): MigrationProgressDto | null {
  const id = String(jobId || '').trim();
  if (!id) return null;
  if (!Number.isFinite(ownerUserId)) return null;
  pruneExpired();
  const entry = progressStore.get(id);
  if (!entry) return null;
  if (entry.ownerUserId !== ownerUserId) return null;
  if (Date.now() - entry.updatedAt > PROGRESS_TTL_MS) {
    progressStore.delete(id);
    return null;
  }
  const { ownerUserId: _owner, ...dto } = entry;
  return dto;
}

export function clearMigrationProgress(jobId: string, ownerUserId?: number): void {
  const id = String(jobId || '').trim();
  if (!id) return;
  if (ownerUserId == null) {
    progressStore.delete(id);
    return;
  }
  const entry = progressStore.get(id);
  if (entry && entry.ownerUserId === ownerUserId) {
    progressStore.delete(id);
  }
}
