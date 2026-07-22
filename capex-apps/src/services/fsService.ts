import type { FeasibilityStudy, FSRealization } from '../types';
import {
  createFsStudyViaBackend,
  fetchFsRealizationsFromBackend,
  fetchFsStudiesFromBackend,
  fetchFsStudyByIdFromBackend,
  saveFsRealizationViaBackend,
  updateFsStudyViaBackend,
} from './fsApi';

export type FsServiceContext = {
  userId?: number;
};

function requireBackend(operation: string): never {
  throw new Error(`${operation}: backend required (capexbe BFF).`);
}

export const getAllFeasibilityStudies = async (ctx?: FsServiceContext): Promise<FeasibilityStudy[]> => {
  const userId = ctx?.userId;
  if (userId == null) return [];
  const be = await fetchFsStudiesFromBackend(userId);
  return be ?? [];
};

export const getFeasibilityStudyById = async (
  id: string,
  ctx?: FsServiceContext,
): Promise<FeasibilityStudy | null> => {
  const userId = ctx?.userId;
  if (userId == null) return null;
  const be = await fetchFsStudyByIdFromBackend(userId, id);
  return be ?? null;
};

export const createFSProposal = async (
  fsData: Omit<FeasibilityStudy, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ctx?: FsServiceContext,
): Promise<FeasibilityStudy> => {
  const id = fsData.id || `FS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const payload = {
    ...fsData,
    id,
    conclusion: fsData.conclusion || 'Pending',
  } as FeasibilityStudy;

  const userId = ctx?.userId;
  if (userId == null) requireBackend('createFSProposal');
  const be = await createFsStudyViaBackend(userId, payload);
  if (be) return be;
  requireBackend('createFSProposal');
};

export const updateFSProposal = async (
  id: string,
  updates: Partial<FeasibilityStudy>,
  ctx?: FsServiceContext,
): Promise<FeasibilityStudy> => {
  const userId = ctx?.userId;
  if (userId == null) requireBackend('updateFSProposal');
  const be = await updateFsStudyViaBackend(userId, id, updates);
  if (be) return be;
  requireBackend('updateFSProposal');
};

export const getFSRealizations = async (fsId: string, ctx?: FsServiceContext): Promise<FSRealization[]> => {
  const userId = ctx?.userId;
  if (userId == null) return [];
  const be = await fetchFsRealizationsFromBackend(userId, fsId);
  return be ?? [];
};

export const saveFSRealization = async (
  realization: FSRealization,
  ctx?: FsServiceContext,
): Promise<FSRealization> => {
  const id = realization.id || `FSR-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const payload = { ...realization, id };

  const userId = ctx?.userId;
  if (userId == null) requireBackend('saveFSRealization');
  const be = await saveFsRealizationViaBackend(userId, payload);
  if (be) return be;
  requireBackend('saveFSRealization');
};
