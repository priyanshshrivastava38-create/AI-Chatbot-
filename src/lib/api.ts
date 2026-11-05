import { getEnv } from "./env";
import { RateLimitError } from "./errors";
import { checkRateLimit } from "./rate-limit";
import { requireUser } from "./session";

/** Signed-in + rate limited, the default guard for every non-streaming API route. */
export async function requireRateLimitedUser(scope: string, limitPerMinute?: number) {
  const user = await requireUser();
  const env = getEnv();
  const limit = checkRateLimit(
    `${scope}:${user.id}`,
    limitPerMinute ?? env.API_RATE_LIMIT_PER_MINUTE,
  );
  if (!limit.ok) {
    throw new RateLimitError(
      limit.retryAfterMs,
      "Too many requests. Please slow down before trying again.",
    );
  }
  return user;
}
