import { test } from "node:test";
import assert from "node:assert/strict";

import { estimateMessagesTokens, estimateTokens } from "../src/lib/tokens";

test("estimateTokens returns 0 for empty or missing text", () => {
  assert.equal(estimateTokens(""), 0);
  // The implementation guards with `if (!text)`, so any falsy value yields 0.
  assert.equal(estimateTokens(undefined as unknown as string), 0);
});

test("estimateTokens charges non-CJK text at roughly four characters per token", () => {
  assert.equal(estimateTokens("hello"), 2); // ceil(5 / 4)
  assert.equal(estimateTokens("hello world"), 3); // ceil(11 / 4)
  assert.equal(estimateTokens("abcd"), 1); // ceil(4 / 4)
});

test("estimateTokens charges each CJK character as one token", () => {
  assert.equal(estimateTokens("你好"), 2);
  assert.equal(estimateTokens("日本語"), 3);
  assert.equal(estimateTokens("한국어"), 3); // Hangul syllables
});

test("estimateTokens mixes CJK and Latin correctly", () => {
  // "AI 模型" => 2 CJK + 3 other => ceil(2 + 3/4) = 3
  assert.equal(estimateTokens("AI 模型"), 3);
});

test("estimateMessagesTokens adds a per-message overhead", () => {
  assert.equal(estimateMessagesTokens([]), 0);
  // content "hi" -> 1, role "user" -> 1, +4 overhead
  assert.equal(estimateMessagesTokens([{ role: "user", content: "hi" }]), 6);
});

test("estimateMessagesTokens sums every message", () => {
  const single = estimateMessagesTokens([
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello there friend" },
  ]);
  assert.equal(
    single,
    estimateMessagesTokens([{ role: "user", content: "hi" }]) +
      estimateMessagesTokens([{ role: "assistant", content: "hello there friend" }]),
  );
});
