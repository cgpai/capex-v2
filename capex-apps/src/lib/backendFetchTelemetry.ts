export type BackendFetchTelemetryEvent = {
  source: string;
  status: 'success' | 'fallback';
  reason?: string;
  httpStatus?: number;
  at: string;
};

const STORAGE_KEY = 'capexbe:fetch-telemetry';
const MAX_EVENTS = 200;

function readEvents(): BackendFetchTelemetryEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BackendFetchTelemetryEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEvents(events: BackendFetchTelemetryEvent[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // no-op: telemetry must never break business flow
  }
}

export function trackBackendFetch(
  source: string,
  status: BackendFetchTelemetryEvent['status'],
  options?: { reason?: string; httpStatus?: number },
): void {
  const next: BackendFetchTelemetryEvent = {
    source,
    status,
    reason: options?.reason,
    httpStatus: options?.httpStatus,
    at: new Date().toISOString(),
  };
  const current = readEvents();
  current.push(next);
  writeEvents(current);
}

export function getBackendFetchTelemetry(): BackendFetchTelemetryEvent[] {
  return readEvents();
}

export function clearBackendFetchTelemetry(): void {
  writeEvents([]);
}
