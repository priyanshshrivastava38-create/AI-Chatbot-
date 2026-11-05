import { test } from "node:test";
import assert from "node:assert/strict";

import {
  abortRun,
  beginRun,
  hasActiveRun,
  releaseRun,
  runKey,
} from "../src/lib/ai/active-runs";

test("runKey composes a deterministic key from user and conversation", () => {
  assert.equal(runKey("u1", "c1"), "u1:c1");
});

test("beginRun registers a controller and rejects a duplicate for the same key", () => {
  const key = "user-a:conv-1";
  const first = beginRun(key);
  assert.ok(first instanceof AbortController);
  assert.equal(hasActiveRun(key), true);

  const second = beginRun(key);
  assert.equal(second, null);

  releaseRun(key, first as AbortController);
  assert.equal(hasActiveRun(key), false);
});

test("releaseRun only clears the run it owns", () => {
  const key = "user-b:conv-2";
  const controller = beginRun(key);
  assert.ok(controller);

  // A stale controller from another run must not tear down the live one.
  releaseRun(key, new AbortController());
  assert.equal(hasActiveRun(key), true);

  releaseRun(key, controller as AbortController);
  assert.equal(hasActiveRun(key), false);
});

test("abortRun signals an in-flight run and reports whether one existed", () => {
  const key = "user-c:conv-3";
  const controller = beginRun(key) as AbortController;

  assert.equal(abortRun("user-c:missing"), false);
  assert.equal(abortRun(key), true);
  assert.equal(controller.signal.aborted, true);

  releaseRun(key, controller);
});
