// ai/context.ts imports the Prisma client (via ../db) at module load, so the minimum env must be
// present before it is imported. The branches exercised here (fits-in-budget and a single
// over-budget message) both keep `dropped.length === 0`, so buildContext never reaches the
// provider or the database. The drop -> rolling-summary branch does require both and is skipped.
Object.assign(process.env, { NODE_ENV: "test" });
process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/prism_test";
process.env.AUTH_SECRET = "unit-test-secret-that-is-long-enough";
process.env.AI_PROVIDER = "ollama";

import { test } from "node:test";
import assert from "node:assert/strict";

import { estimateMessagesTokens } from "../src/lib/tokens";

const baseOptions = {
  conversationId: "conv-1",
  conversationSummary: null,
  summaryCovers: 0,
  model: "qwen2.5:3b",
};

test("buildContext includes the whole transcript when it fits the budget", async () => {
  const { buildContext } = await import("../src/lib/ai/context");

  const history = [
    { id: "1", role: "USER" as const, content: "Hi" },
    { id: "2", role: "ASSISTANT" as const, content: "Hello there friend" },
  ];

  const result = await buildContext({
    ...baseOptions,
    systemPrompt: "You are helpful.",
    history,
    budgetTokens: 5000,
  });

  assert.equal(result.includedCount, 2);
  assert.equal(result.droppedCount, 0);
  assert.equal(result.summaryApplied, false);
  assert.equal(result.messages.length, 3);

  assert.deepEqual(result.messages[0], { role: "system", content: "You are helpful." });
  assert.deepEqual(result.messages[1], { role: "user", content: "Hi" });
  assert.deepEqual(result.messages[2], { role: "assistant", content: "Hello there friend" });

  assert.equal(result.estimatedTokens, estimateMessagesTokens(result.messages));
});

test("buildContext keeps a tail of a lone over-budget message instead of dropping it", async () => {
  const { buildContext } = await import("../src/lib/ai/context");

  const oversized = "x".repeat(2000);
  const result = await buildContext({
    ...baseOptions,
    systemPrompt: "Sp",
    history: [{ id: "1", role: "USER" as const, content: oversized }],
    budgetTokens: 700,
  });

  // Only one message existed, so nothing was "dropped" and no summarisation/DB work was triggered.
  assert.equal(result.includedCount, 1);
  assert.equal(result.droppedCount, 0);
  assert.equal(result.summaryApplied, false);
  assert.equal(result.messages.length, 2);

  const kept = result.messages[1];
  assert.equal(kept.role, "user");
  // 2000 chars was truncated to the budgeted tail (1192 chars) rather than discarded.
  assert.equal(kept.content, "x".repeat(1192));
  assert.ok(kept.content.length < oversized.length);
  assert.ok(kept.content.length >= 200);
});

test("buildContext always emits the system prompt even with no history", async () => {
  const { buildContext } = await import("../src/lib/ai/context");

  const result = await buildContext({
    ...baseOptions,
    systemPrompt: "You are helpful.",
    history: [],
    budgetTokens: 5000,
  });

  assert.equal(result.includedCount, 0);
  assert.equal(result.droppedCount, 0);
  assert.equal(result.summaryApplied, false);
  assert.deepEqual(result.messages, [{ role: "system", content: "You are helpful." }]);
});
