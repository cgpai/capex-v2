type ActivityListener = () => void;

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const;
const THROTTLE_MS = 30_000;

let lastActivityAt = Date.now();
let throttleTimer: ReturnType<typeof setTimeout> | null = null;
let attached = false;
const listeners = new Set<ActivityListener>();

function notifyListeners(): void {
  lastActivityAt = Date.now();
  listeners.forEach((fn) => fn());
}

function onActivity(): void {
  if (throttleTimer) return;
  notifyListeners();
  throttleTimer = setTimeout(() => {
    throttleTimer = null;
  }, THROTTLE_MS);
}

/** Singleton user activity tracker — throttled to avoid excessive heartbeat calls. */
export function startUserActivityTracker(): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  // Always reset on (re)start — stale timestamps caused false idle logout after HMR.
  lastActivityAt = Date.now();

  if (attached) {
    return () => {};
  }
  attached = true;

  for (const evt of ACTIVITY_EVENTS) {
    window.addEventListener(evt, onActivity, { passive: true, capture: true });
  }

  return () => {
    for (const evt of ACTIVITY_EVENTS) {
      window.removeEventListener(evt, onActivity, { capture: true });
    }
    attached = false;
    if (throttleTimer) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
  };
}

export function getLastActivityAt(): number {
  return lastActivityAt;
}

export function subscribeUserActivity(listener: ActivityListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetActivityTimestamp(): void {
  lastActivityAt = Date.now();
}
