import type { User } from '@/types';
import type { AppInitPack } from '@/services/appBootstrapApi';

/** Ambil profil user lengkap (termasuk assignments) dari pack bootstrap. */
export function pickEnrichedUserFromPack(pack: AppInitPack, userId: number): User | null {
  return pack.users.find((u) => u.id === userId) ?? null;
}

/** True jika scope user sudah boleh dipakai untuk filter daftar proyek. */
export function areUserScopesReadyForList(
  currentUser: User,
  dataInitialized: boolean,
  allUsers: User[],
): boolean {
  if ((currentUser.assignments?.length ?? 0) > 0) return true;
  if (!dataInitialized || allUsers.length === 0) return false;
  const full = allUsers.find((u) => u.id === currentUser.id);
  return full != null;
}
