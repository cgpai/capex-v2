/** Defer non-critical prefetches so boot / navigation stays responsive. */
export function scheduleIdlePrefetch(fn: () => void, timeoutMs = 4_000): void {
  if (typeof window === 'undefined') return;
  const run = () => {
    try {
      fn();
    } catch {
      /* best-effort warm */
    }
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: timeoutMs });
  } else {
    window.setTimeout(run, 1_500);
  }
}

/** Run tasks one-by-one when the browser is idle (avoids prefetch storms). */
export function scheduleStaggeredIdle(tasks: Array<() => void>, gapMs = 900): void {
  tasks.forEach((task, index) => {
    scheduleIdlePrefetch(task, 2_000 + index * gapMs);
  });
}
