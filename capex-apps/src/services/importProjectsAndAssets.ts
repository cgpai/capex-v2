/** @deprecated Legacy local DB import removed. Use backend data migration. */
export async function importProjectsAndAssets(): Promise<never> {
  throw new Error('Local DB import removed. Use backend data migration.');
}
