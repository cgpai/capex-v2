import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { User } from '../types';
import { IDLE_TIMEOUT_MS } from '../lib/auth/authConstants';

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

type AuthState = {
  status: AuthStatus;
  user: User | null;
  roles: string[];
  idleTimeoutMs: number;
  setSession: (user: User, roles?: string[], idleTimeoutMs?: number) => void;
  clearSession: () => void;
  setStatus: (status: AuthStatus) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  user: null,
  roles: [],
  idleTimeoutMs: IDLE_TIMEOUT_MS,
  setSession: (user, roles = [], idleTimeoutMs = IDLE_TIMEOUT_MS) =>
    set({ status: 'authenticated', user, roles, idleTimeoutMs }),
  clearSession: () =>
    set({
      status: 'anonymous',
      user: null,
      roles: [],
      idleTimeoutMs: IDLE_TIMEOUT_MS,
    }),
  setStatus: (status) => set({ status }),
}));

/** Memoized selectors — avoid global rerenders. */
export function useAuthUser(): User | null {
  return useAuthStore(useShallow((s) => s.user));
}

export function useAuthStatus(): AuthStatus {
  return useAuthStore((s) => s.status);
}

export function useAuthIdleTimeoutMs(): number {
  return useAuthStore((s) => s.idleTimeoutMs);
}
