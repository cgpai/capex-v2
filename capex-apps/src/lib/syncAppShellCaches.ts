import type { QueryClient } from '@tanstack/react-query';
import type { AppBootstrapPayload } from '@/hooks/queries/fetchAppBootstrapData';
import type { ConfigurationDataPack } from '@/services/configurationApi';
import { buildSeedFromBootstrap, mergeConfigurationPack } from '@/features/configuration/core/configurationPageUtils';
import type { User, UserRole } from '@/types';
import { writeCachedBootstrap, readCachedBootstrap } from './appBootstrapCache';
import { writeCachedRoles } from './appRolesCache';
import { readCachedAuthUser, writeCachedAuthUser } from './authSessionCache';
import {
  readConfigurationPackCacheAnyAge,
  writeConfigurationPackCache,
} from './configurationDiskCache';
import { queryKeys } from './query-keys';
import { enrichUserAssignments } from './userRoleResolution';

const PATCH_GUARD_KEY = 'capex.shellPatchGuard.v1';

/** Lama patch lokal dilindungi dari overwrite bootstrap/refetch (ms). */
export const SHELL_PATCH_GUARD_MS = 60_000;

export type AppShellCachePatch = {
  users?: User[];
  roles?: UserRole[];
  /** User sesi aktif — ikut ditulis ke auth cache setelah assignment diperkaya. */
  currentUser?: User | null;
};

export function markShellCachePatched(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PATCH_GUARD_KEY, String(Date.now()));
  } catch {
    /* quota */
  }
}

export function isShellCachePatchGuarded(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(PATCH_GUARD_KEY);
    const at = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(at) && Date.now() - at < SHELL_PATCH_GUARD_MS;
  } catch {
    return false;
  }
}

export function clearShellCachePatchGuard(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PATCH_GUARD_KEY);
  } catch {
    /* noop */
  }
}

function resolveActorId(currentUser?: User | null): number | null {
  const fromUser = currentUser?.id;
  if (fromUser != null && Number.isFinite(fromUser)) return fromUser;
  const cached = readCachedAuthUser()?.id;
  if (cached != null && Number.isFinite(cached)) return cached;
  if (typeof window === 'undefined') return null;
  const fromSession = parseInt(sessionStorage.getItem('currentUserId') || '', 10);
  return Number.isFinite(fromSession) ? fromSession : null;
}

/**
 * Sinkronkan semua cache shell (localStorage + TanStack Query + configuration disk)
 * setelah ubah users/roles di Configuration agar F5 dan tab lain konsisten.
 */
export function syncAppShellCaches(
  queryClient: QueryClient,
  patch: AppShellCachePatch,
): User | null {
  if (typeof window === 'undefined') {
    return patch.currentUser ?? null;
  }

  markShellCachePatched();

  const existingBoot =
    queryClient.getQueryData<AppBootstrapPayload>(queryKeys.app.bootstrap) ??
    readCachedBootstrap();

  const roles = patch.roles ?? existingBoot?.roles ?? [];
  const usersSource = patch.users ?? existingBoot?.users ?? [];
  const users = usersSource.map((u) => enrichUserAssignments(u, roles));

  const nextBoot: AppBootstrapPayload = {
    users,
    roles,
    multiYears: existingBoot?.multiYears ?? [],
    allPeriods: existingBoot?.allPeriods ?? [],
  };

  writeCachedBootstrap(nextBoot);
  writeCachedRoles(roles);
  queryClient.setQueryData(queryKeys.app.bootstrap, nextBoot);

  const actorId = resolveActorId(patch.currentUser);

  if (actorId != null) {
    const cfgKey = queryKeys.configuration.page(actorId);
    const cfgExisting =
      queryClient.getQueryData<Partial<ConfigurationDataPack>>(cfgKey) ??
      readConfigurationPackCacheAnyAge(actorId);
    const cfgMerged = mergeConfigurationPack(
      cfgExisting ?? buildSeedFromBootstrap(nextBoot),
      { users: nextBoot.users, roles: nextBoot.roles },
    );
    queryClient.setQueryData(cfgKey, cfgMerged);
    writeConfigurationPackCache(actorId, cfgMerged, { replace: true });
  }

  let resolvedCurrent: User | null = patch.currentUser ?? null;
  if (resolvedCurrent) {
    resolvedCurrent = enrichUserAssignments(resolvedCurrent, roles);
    writeCachedAuthUser(resolvedCurrent);
    try {
      sessionStorage.setItem('currentUserId', String(resolvedCurrent.id));
    } catch {
      /* private mode */
    }
  } else if (users.length && actorId != null) {
    const self = users.find((u) => u.id === actorId);
    if (self) {
      resolvedCurrent = self;
      writeCachedAuthUser(self);
    }
  }

  return resolvedCurrent;
}

/** Ambil users/roles ter-patch dari disk (sumber paling andal saat guard aktif). */
export function readGuardedAuthBootstrapSlice(): Pick<
  AppBootstrapPayload,
  'users' | 'roles'
> | null {
  const cached = readCachedBootstrap();
  if (!cached) return null;
  const hasUsers = (cached.users?.length ?? 0) > 0;
  const hasRoles = (cached.roles?.length ?? 0) > 0;
  if (!hasUsers && !hasRoles) return null;
  return {
    users: hasUsers ? cached.users : [],
    roles: hasRoles ? cached.roles : [],
  };
}

/** Gabungkan payload bootstrap server dengan cache lokal (users/roles) saat masih dalam guard. */
export function mergeBootstrapPreservingAuthPatch(
  server: AppBootstrapPayload,
  queryClient: QueryClient,
): AppBootstrapPayload {
  if (!isShellCachePatchGuarded()) return server;

  const fromDisk = readGuardedAuthBootstrapSlice();
  const fromQuery = queryClient.getQueryData<AppBootstrapPayload>(queryKeys.app.bootstrap);
  const localUsers =
    (fromDisk?.users?.length ? fromDisk.users : null) ??
    (fromQuery?.users?.length ? fromQuery.users : null) ??
    server.users;
  const localRoles =
    (fromDisk?.roles?.length ? fromDisk.roles : null) ??
    (fromQuery?.roles?.length ? fromQuery.roles : null) ??
    server.roles;

  return {
    users: localUsers,
    roles: localRoles,
    multiYears: server.multiYears?.length ? server.multiYears : (fromQuery?.multiYears ?? []),
    allPeriods: server.allPeriods?.length ? server.allPeriods : (fromQuery?.allPeriods ?? []),
  };
}
