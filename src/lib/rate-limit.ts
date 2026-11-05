type Bucket = {
  hits: number[];
  lastSeen: number;
};

const windows = new Map<string, Bucket>();

const MAX_KEYS = 10_000;

function evictIfNeeded(now: number) {
  if (windows.size <= MAX_KEYS) return;
  const cutoff = now - 60_000;
  for (const [key, bucket] of windows) {
    if (bucket.lastSeen < cutoff) windows.delete(key);
  }
  if (windows.size <= MAX_KEYS) return;
  const sorted = [...windows.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen);
  for (const [key] of sorted.slice(0, windows.size - MAX_KEYS)) {
    windows.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
};

/**
 * Fixed-window-per-minute limiter kept in process memory. On a single instance this
 * is enough; behind multiple instances the limit becomes per-instance, so set
 * instances: 1 or move `windows` to Redis before scaling out.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs = 60_000,
): RateLimitResult {
  const now = Date.now();
  evictIfNeeded(now);

  const bucket = windows.get(key) ?? { hits: [], lastSeen: now };
  bucket.lastSeen = now;
  bucket.hits = bucket.hits.filter((hit) => now - hit < windowMs);

  if (bucket.hits.length >= limit) {
    windows.set(key, bucket);
    const oldest = bucket.hits[0];
    return {
      ok: false,
      limit,
      remaining: 0,
      retryAfterMs: Math.max(0, windowMs - (now - oldest)),
    };
  }

  bucket.hits.push(now);
  windows.set(key, bucket);
  return {
    ok: true,
    limit,
    remaining: limit - bucket.hits.length,
    retryAfterMs: 0,
  };
}

export function resetRateLimits() {
  windows.clear();
}
