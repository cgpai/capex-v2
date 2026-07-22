const STORAGE_PREFIX = 'onboarding-completed';

export type OnboardingState = {
  completedTours: Record<string, number>;
};

function storageKey(userId: number): string {
  return `${STORAGE_PREFIX}-${userId}`;
}

function readState(userId: number): OnboardingState {
  if (typeof window === 'undefined') return { completedTours: {} };
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { completedTours: {} };
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    if (!parsed || typeof parsed !== 'object' || !parsed.completedTours) {
      return { completedTours: {} };
    }
    return { completedTours: parsed.completedTours };
  } catch {
    return { completedTours: {} };
  }
}

function writeState(userId: number, state: OnboardingState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function isTourCompleted(userId: number, tourId: string, version: number): boolean {
  const state = readState(userId);
  return (state.completedTours[tourId] ?? 0) >= version;
}

export function markTourCompleted(userId: number, tourId: string, version: number): void {
  const state = readState(userId);
  state.completedTours[tourId] = version;
  writeState(userId, state);
}

export function resetTour(userId: number, tourId: string): void {
  const state = readState(userId);
  delete state.completedTours[tourId];
  writeState(userId, state);
}
