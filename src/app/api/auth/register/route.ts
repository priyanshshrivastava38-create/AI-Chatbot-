import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { route } from "@/lib/errors";
import { clientIp } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { RateLimitError, AppError } from "@/lib/errors";
import { readJsonBody, registerSchema } from "@/lib/validation";
import { logger } from "@/lib/log";

export const POST = route(async (request: Request) => {
  const ip = clientIp(request.headers);
  const limit = checkRateLimit(`register:${ip}`, 10);
  if (!limit.ok) throw new RateLimitError(limit.retryAfterMs, "Too many sign-up attempts");

  const body = await readJsonBody(request, registerSchema);

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    throw new AppError("An account with this email already exists", 409, "email_taken");
  }

  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await prisma.user.create({
    data: {
      email: body.email,
      name: body.name ?? null,
      passwordHash,
      preferences: { create: {} },
    },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  logger.info("auth.register", { userId: user.id });
  return NextResponse.json({ user }, { status: 201 });
});
