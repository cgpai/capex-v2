const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface SnapshotEnvelope<T> {
  ts: number;
  data: T;
}

function readPageSnapshotEnvelope<T>(key: string): SnapshotEnvelope<T> | null {
  if (typeof window === 'undefined') return null;
  const storageKey = `page-snapshot:${key}`;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      const envelope = JSON.parse(raw) as SnapshotEnvelope<T>;
      if (envelope?.data != null) return envelope;
    }
  } catch { /* ignore */ }

  try {
    const legacy = window.sessionStorage.getItem(storageKey);
    if (legacy) {
      window.sessionStorage.removeItem(storageKey);
      return { ts: Date.now(), data: JSON.parse(legacy) as T };
    }
  } catch { /* ignore */ }

  return null;
}

export function readPageSnapshot<T>(key: string): T | null {
  const envelope = readPageSnapshotEnvelope<T>(key);
  if (!envelope) return null;
  if (envelope.ts && Date.now() - envelope.ts < SNAPSHOT_MAX_AGE_MS) {
    return envelope.data;
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(`page-snapshot:${key}`);
    } catch { /* ignore */ }
  }
  return null;
}

/** Instant paint — ignore TTL (same idea as capex project list disk cache any age). */
export function readPageSnapshotAnyAge<T>(key: string): T | null {
  return readPageSnapshotEnvelope<T>(key)?.data ?? null;
}

export function hasPageSnapshotOnDisk(key: string): boolean {
  if (typeof window === 'undefined') return false;
  const storageKey = `page-snapshot:${key}`;
  try {
    return !!window.localStorage.getItem(storageKey);
  } catch {
    return false;
  }
}

export function writePageSnapshot<T>(key: string, payload: T): void {
  if (typeof window === 'undefined') return;
  const storageKey = `page-snapshot:${key}`;
  const envelope: SnapshotEnvelope<T> = { ts: Date.now(), data: payload };
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(envelope));
  } catch {
    // ignore quota/serialization errors
  }
}
