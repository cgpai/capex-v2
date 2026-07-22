import * as configService from '@/services/configService';

/** Workflow sets untuk dropdown Asset Type — dimuat hanya saat target Assets. */
export async function fetchDataMigrationWorkflowSets() {
  return configService.getAllWorkflowSets();
}
