import { InternalServerErrorException, Logger } from '@nestjs/common';

const log = new Logger('FsPageBundle');

export async function runFsPageBundle<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`${label}: ${message}`, err instanceof Error ? err.stack : undefined);
    throw new InternalServerErrorException(`${label} failed: ${message}`);
  }
}
