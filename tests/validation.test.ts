// validation.chatSendSchema() reads the AI config at call time, which in turn reads process.env.
// Seed the minimum env (and a small MAX_INPUT_CHARS so the length limit is cheap to exercise)
// before the module is used. getEnv caches on first call, so these values must be set first.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/prism_test";
process.env.AUTH_SECRET = "unit-test-secret-that-is-long-enough";
process.env.AI_PROVIDER = "ollama";
process.env.MAX_INPUT_CHARS = "200";

import { test } from "node:test";
import assert from "node:assert/strict";

import { ValidationError } from "../src/lib/errors";
import {
  chatRegenerateSchema,
  chatSendSchema,
  conversationCreateSchema,
  conversationIdParams,
  conversationUpdateSchema,
  loginSchema,
  parseInput,
  parseSearchParams,
  preferencesUpdateSchema,
  readJsonBody,
  registerSchema,
} from "../src/lib/validation";

test("registerSchema lower-cases the email and validates the password", () => {
  const parsed = registerSchema.safeParse({
    email: "  Test@Example.com ",
    name: "Ada",
    password: "secret123",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.email, "test@example.com");
});

test("registerSchema rejects weak or short passwords and bad emails", () => {
  assert.equal(registerSchema.safeParse({ email: "a@b.co", password: "abc123" }).success, false);
  assert.equal(registerSchema.safeParse({ email: "a@b.co", password: "abcdefgh" }).success, false);
  assert.equal(registerSchema.safeParse({ email: "a@b.co", password: "12345678" }).success, false);
  assert.equal(registerSchema.safeParse({ email: "not-an-email", password: "secret123" }).success, false);
});

test("registerSchema bounds the name field", () => {
  assert.equal(registerSchema.safeParse({ email: "a@b.co", password: "secret123", name: "" }).success, false);
  assert.equal(
    registerSchema.safeParse({ email: "a@b.co", password: "secret123", name: "n".repeat(61) }).success,
    false,
  );
});

test("loginSchema normalises email and requires a password", () => {
  const parsed = loginSchema.safeParse({ email: "A@B.co", password: "x" });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.email, "a@b.co");
    assert.equal(parsed.data.password, "x");
  }
  assert.equal(loginSchema.safeParse({ email: "a@b.co", password: "" }).success, false);
  assert.equal(loginSchema.safeParse({ email: "nope", password: "x" }).success, false);
});

test("conversationCreateSchema accepts an empty body and optional title, but is strict", () => {
  assert.equal(conversationCreateSchema.safeParse({}).success, true);
  assert.equal(conversationCreateSchema.safeParse({ title: "Hi" }).success, true);
  assert.equal(conversationCreateSchema.safeParse({ title: "" }).success, false);
  assert.equal(conversationCreateSchema.safeParse({ title: "t".repeat(121) }).success, false);
  assert.equal(conversationCreateSchema.safeParse({ unexpected: 1 }).success, false);
});

test("conversationUpdateSchema requires at least one updatable field", () => {
  assert.equal(conversationUpdateSchema.safeParse({}).success, false);
  assert.equal(conversationUpdateSchema.safeParse({ title: "A" }).success, true);
  assert.equal(conversationUpdateSchema.safeParse({ model: "m" }).success, true);
  assert.equal(conversationUpdateSchema.safeParse({ title: "A", other: 1 }).success, false);
});

test("chatRegenerateSchema validates id and generation params", () => {
  assert.equal(chatRegenerateSchema.safeParse({ conversationId: "c1" }).success, true);
  assert.equal(chatRegenerateSchema.safeParse({}).success, false);
  assert.equal(chatRegenerateSchema.safeParse({ conversationId: "" }).success, false);
  assert.equal(
    chatRegenerateSchema.safeParse({ conversationId: "c1", temperature: 5 }).success,
    false,
  );
  assert.equal(
    chatRegenerateSchema.safeParse({ conversationId: "c1", maxOutputTokens: 10 }).success,
    false,
  );
  assert.equal(
    chatRegenerateSchema.safeParse({ conversationId: "c".repeat(65) }).success,
    false,
  );
});

test("chatSendSchema enforces the configured max input length", () => {
  assert.equal(chatSendSchema().safeParse({ conversationId: "c", content: "hi" }).success, true);
  assert.equal(chatSendSchema().safeParse({ conversationId: "c", content: "a".repeat(200) }).success, true);

  const tooLong = chatSendSchema().safeParse({ conversationId: "c", content: "a".repeat(201) });
  assert.equal(tooLong.success, false);
  if (!tooLong.success) {
    assert.ok(
      tooLong.error.issues.some((issue) => issue.message.includes("200 characters")),
      "length error mentions the configured limit",
    );
  }
});

test("chatSendSchema rejects blank/whitespace content and extra keys", () => {
  assert.equal(chatSendSchema().safeParse({ conversationId: "c", content: "" }).success, false);
  assert.equal(chatSendSchema().safeParse({ conversationId: "c", content: "   " }).success, false);
  assert.equal(
    chatSendSchema().safeParse({ conversationId: "c", content: "hi", bogus: 1 }).success,
    false,
  );
});

test("chatSendSchema caps attachments at five", () => {
  const six = ["1", "2", "3", "4", "5", "6"];
  assert.equal(
    chatSendSchema().safeParse({ conversationId: "c", content: "hi", attachmentIds: six }).success,
    false,
  );
  assert.equal(
    chatSendSchema().safeParse({
      conversationId: "c",
      content: "hi",
      attachmentIds: six.slice(0, 5),
    }).success,
    true,
  );
});

test("preferencesUpdateSchema allows empty, nulls optional scalars and bounds numbers", () => {
  assert.equal(preferencesUpdateSchema.safeParse({}).success, true);
  assert.equal(preferencesUpdateSchema.safeParse({ defaultModel: null }).success, true);
  assert.equal(preferencesUpdateSchema.safeParse({ systemPrompt: null }).success, true);
  assert.equal(preferencesUpdateSchema.safeParse({ temperature: 2.5 }).success, false);
  assert.equal(preferencesUpdateSchema.safeParse({ maxOutputTokens: 100.5 }).success, false);
  assert.equal(preferencesUpdateSchema.safeParse({ sendOnEnter: "yes" }).success, false);
  assert.equal(preferencesUpdateSchema.safeParse({ systemPrompt: "x".repeat(4001) }).success, false);
});

test("conversationIdParams requires a bounded id", () => {
  assert.equal(conversationIdParams.safeParse({ id: "abc" }).success, true);
  assert.equal(conversationIdParams.safeParse({}).success, false);
  assert.equal(conversationIdParams.safeParse({ id: "" }).success, false);
});

test("readJsonBody parses a valid body and reports a JSON error otherwise", async () => {
  const request = new Request("http://localhost/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: "a@b.co", password: "secret123" }),
  });
  const body = await readJsonBody(request, registerSchema);
  assert.equal(body.email, "a@b.co");

  const invalid = new Request("http://localhost/api", { method: "POST", body: "{not json" });
  await assert.rejects(() => readJsonBody(invalid, registerSchema), (thrown: unknown) => {
    assert.ok(thrown instanceof ValidationError);
    assert.equal((thrown as ValidationError).status, 422);
    assert.equal((thrown as ValidationError).issues[0].message, "Request body must be valid JSON");
    assert.equal((thrown as ValidationError).issues[0].path, "(body)");
    return true;
  });

  const mismatched = new Request("http://localhost/api", {
    method: "POST",
    body: JSON.stringify({ email: "bad-email" }),
  });
  await assert.rejects(() => readJsonBody(mismatched, registerSchema), (thrown: unknown) => {
    assert.ok(thrown instanceof ValidationError);
    return true;
  });
});

test("parseSearchParams validates query values", () => {
  const parsed = parseSearchParams(new URLSearchParams([["id", "abc"]]), conversationIdParams);
  assert.deepEqual(parsed, { id: "abc" });

  assert.throws(
    () => parseSearchParams(new URLSearchParams([]), conversationIdParams),
    ValidationError,
  );
});

test("parseInput validates an already-decoded object", () => {
  assert.deepEqual(parseInput(loginSchema, { email: "a@b.co", password: "x" }), {
    email: "a@b.co",
    password: "x",
  });
  assert.throws(() => parseInput(loginSchema, { email: "a@b.co" }), ValidationError);
});
