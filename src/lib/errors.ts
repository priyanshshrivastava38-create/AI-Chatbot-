import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { EnvConfigError } from "./env";
import { logger } from "./log";

export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = "bad_request") {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  readonly issues: { path: string; message: string }[];

  constructor(issues: { path: string; message: string }[], message = "Invalid request") {
    super(message, 422, "validation_failed");
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "unauthorized");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource") {
    super(message, 403, "forbidden");
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "not_found");
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number, message = "Too many requests") {
    super(message, 429, "rate_limited");
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class ProviderError extends AppError {
  constructor(message = "The AI provider could not complete the request") {
    super(message, 502, "provider_error");
    this.name = "ProviderError";
  }
}

function describeZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}

/**
 * Turns any thrown value into a JSON response that only carries messages safe to show
 * a client; unexpected failures are logged server-side and reported generically.
 */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    const errorBody: { code: string; message: string; details?: unknown } = {
      code: error.code,
      message: error.message,
    };
    if (error instanceof ValidationError) errorBody.details = error.issues;
    const headers: Record<string, string> = {};
    if (error instanceof RateLimitError) {
      headers["Retry-After"] = String(Math.ceil(error.retryAfterMs / 1000));
    }
    return NextResponse.json({ error: errorBody }, { status: error.status, headers });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "validation_failed",
          message: "Invalid request",
          details: describeZodError(error),
        },
      },
      { status: 422 },
    );
  }

  if (error instanceof EnvConfigError) {
    logger.error("env.invalid", { message: error.message });
    return NextResponse.json(
      { error: { code: "server_misconfigured", message: "The server is misconfigured." } },
      { status: 500 },
    );
  }

  logger.error("request.unhandled", {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  return NextResponse.json(
    { error: { code: "internal_error", message: "Something went wrong. Please try again." } },
    { status: 500 },
  );
}

/** Wrapper so every route handler funnels errors through the same sanitising path. */
export function route<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
