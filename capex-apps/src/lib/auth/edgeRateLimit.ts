/** In-process sliding window — best-effort burst control at the edge (per instance). */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkEdgeRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }
  return bucket.count <= max;
}
