import { test } from "node:test";
import assert from "node:assert/strict";

import { z } from "zod";

import { EnvConfigError } from "../src/lib/env";
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  ProviderError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
  route,
  toErrorResponse,
} from "../src/lib/errors";

// toErrorResponse logs unexpected failures; silence the structured logger so test output stays clean.
async function quiet<T>(fn: () => T | Promise<T>): Promise<T> {
  const original = { error: console.error, warn: console.warn, info: console.info };
  console.error = () => {};
  console.warn = () => {};
  console.info = () => {};
  try {
    return await fn();
  } finally {
    console.error = original.error;
    console.warn = original.warn;
    console.info = original.info;
  }
}

test("error classes carry their status, code and name", () => {
  const app = new AppError("boom");
  assert.equal(app.status, 400);
  assert.equal(app.code, "bad_request");
  assert.equal(app.name, "AppError");
  assert.ok(app instanceof Error);

  const validation = new ValidationError([{ path: "email", message: "bad" }]);
  assert.equal(validation.status, 422);
  assert.equal(validation.code, "validation_failed");
  assert.equal(validation.name, "ValidationError");
  assert.equal(validation.message, "Invalid request");
  assert.deepEqual(validation.issues, [{ path: "email", message: "bad" }]);
  assert.ok(validation instanceof AppError);

  assert.equal(new UnauthorizedError().status, 401);
  assert.equal(new UnauthorizedError().code, "unauthorized");
  assert.equal(new ForbiddenError().status, 403);
  assert.equal(new ForbiddenError().code, "forbidden");
  assert.equal(new NotFoundError().status, 404);
  assert.equal(new NotFoundError().code, "not_found");
  assert.equal(new ProviderError().status, 502);
  assert.equal(new ProviderError().code, "provider_error");

  const limited = new RateLimitError(2000);
  assert.equal(limited.status, 429);
  assert.equal(limited.code, "rate_limited");
  assert.equal(limited.retryAfterMs, 2000);
});

test("AppError envelopes expose only code and message", async () => {
  const res = await quiet(() => toErrorResponse(new AppError("nope", 400, "custom_code")));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: { code: "custom_code", message: "nope" } });
});

test("ValidationError adds its issue list as details", async () => {
  const issues = [{ path: "email", message: "bad" }];
  const res = await quiet(() => toErrorResponse(new ValidationError(issues)));
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.error.code, "validation_failed");
  assert.equal(body.error.message, "Invalid request");
  assert.deepEqual(body.error.details, issues);
});

test("RateLimitError sets a Retry-After header rounded to whole seconds", async () => {
  const res = await quiet(() => toErrorResponse(new RateLimitError(5000)));
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("Retry-After"), "5");
  const body = await res.json();
  assert.equal(body.error.code, "rate_limited");
  assert.equal(body.error.message, "Too many requests");
});

test("a raw ZodError becomes a sanitised 422", async () => {
  let zodError: unknown;
  try {
    z.object({ a: z.string() }).parse({ a: 1 });
  } catch (error) {
    zodError = error;
  }
  const res = await quiet(() => toErrorResponse(zodError));
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.error.code, "validation_failed");
  assert.equal(body.error.message, "Invalid request");
  assert.ok(Array.isArray(body.error.details));
});

test("EnvConfigError reports a generic server-misconfigured message", async () => {
  const res = await quiet(() => toErrorResponse(new EnvConfigError("missing vars")));
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), {
    error: { code: "server_misconfigured", message: "The server is misconfigured." },
  });
});

test("unexpected errors never leak their internal message", async () => {
  const res = await quiet(
    () => toErrorResponse(new Error("failed to connect postgres://user:topsecret@db:5432")),
  );
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.deepEqual(body, {
    error: { code: "internal_error", message: "Something went wrong. Please try again." },
  });
  assert.ok(!JSON.stringify(body).includes("topsecret"));
  assert.ok(!JSON.stringify(body).includes("postgres://"));
});

test("route funnels thrown errors through the sanitiser and passes results through", async () => {
  const failing = route(async () => {
    throw new NotFoundError("missing");
  });
  const failureResponse = await quiet(() => failing());
  assert.equal(failureResponse.status, 404);
  assert.deepEqual(await failureResponse.json(), { error: { code: "not_found", message: "missing" } });

  const succeeding = route(async () => Response.json({ ok: true }));
  const successResponse = await quiet(() => succeeding());
  assert.equal(successResponse.status, 200);
  assert.deepEqual(await successResponse.json(), { ok: true });
});
