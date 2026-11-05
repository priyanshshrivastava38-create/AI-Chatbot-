import type { DefaultSession } from "next-auth";
import { auth } from "./auth";
import { UnauthorizedError } from "./errors";

type SessionUser = DefaultSession["user"] & { id: string };

/** Returns the signed-in user id, or throws a 401 for API handlers. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || !session.user) throw new UnauthorizedError();
  return session.user as SessionUser;
}

export async function getOptionalUser(): Promise<SessionUser | null> {
  const session = await auth();
  return session?.user?.id ? (session.user as SessionUser) : null;
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
