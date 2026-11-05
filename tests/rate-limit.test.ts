import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkRateLimit,
  resetRateLimits,
  type RateLimitResult,
} from "../src/lib/rate-limit";

test("checkRateLimit allows up to the limit, then denies", () => {
  resetRateLimits();
  const key = "rl-basic";

  const first = checkRateLimit(key, 2);
  assert.equal(first.ok, true);
  assert.equal(first.remaining, 1);
  assert.equal(first.retryAfterMs, 0);

  const second = checkRateLimit(key, 2);
  assert.equal(second.ok, true);
  assert.equal(second.remaining, 0);

  const third = checkRateLimit(key, 2);
  assert.equal(third.ok, false);
  assert.equal(third.remaining, 0);
  assert.equal(third.limit, 2);
});

test("denied results report a retry window inside the configured window", () => {
  resetRateLimits();
  const key = "rl-retry";
  checkRateLimit(key, 1, 60_000);
  const denied = checkRateLimit(key, 1, 60_000);

  assert.equal(denied.ok, false);
  assert.ok(denied.retryAfterMs > 0);
  assert.ok(denied.retryAfterMs <= 60_000);
});

test("limits are tracked independently per key", () => {
  resetRateLimits();
  const a = "rl-key-a";
  const b = "rl-key-b";

  assert.equal(checkRateLimit(a, 1).ok, true);
  assert.equal(checkRateLimit(a, 1).ok, false);
  assert.equal(checkRateLimit(b, 1).ok, true);
});

test("resetRateLimits clears all buckets", () => {
  resetRateLimits();
  const key = "rl-reset";
  checkRateLimit(key, 1);
  assert.equal(checkRateLimit(key, 1).ok, false);

  resetRateLimits();
  const afterReset = checkRateLimit(key, 1);
  assert.equal(afterReset.ok, true);
});

test("hits fall out of the window once it has elapsed", async () => {
  resetRateLimits();
  const key = "rl-window";
  const windowMs = 15;
  const results: RateLimitResult[] = [];

  for (let index = 0; index < 2; index += 1) results.push(checkRateLimit(key, 2, windowMs));
  assert.equal(results[1].ok, false);

  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(checkRateLimit(key, 2, windowMs).ok, true);

  resetRateLimits();
});
