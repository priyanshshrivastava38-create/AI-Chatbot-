import { NextResponse } from "next/server";
import { requireRateLimitedUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { route } from "@/lib/errors";

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const GET = route(async (request: Request) => {
  const user = await requireRateLimitedUser("usage", 60);
  const requestedDays = Number(new URL(request.url).searchParams.get("days") ?? "14");
  const days = Math.min(Math.max(Number.isFinite(requestedDays) ? requestedDays : 14, 1), 90);
  const since = new Date(Date.now() - (days - 1) * 86_400_000);
  since.setHours(0, 0, 0, 0);

  const scoped = { conversation: { userId: user.id }, createdAt: { gte: since } } as const;

  const [perModelRows, aggregate, recentMessages, conversationCount] = await Promise.all([
    prisma.message.groupBy({
      by: ["model"],
      where: scoped,
      _count: { _all: true },
      _sum: { promptTokens: true, completionTokens: true },
    }),
    prisma.message.aggregate({
      where: scoped,
      _count: { _all: true },
      _sum: { promptTokens: true, completionTokens: true },
    }),
    prisma.message.findMany({
      where: scoped,
      select: { createdAt: true, role: true, status: true, promptTokens: true, completionTokens: true },
    }),
    prisma.conversation.count({ where: { userId: user.id } }),
  ]);

  const buckets = new Map<string, { messages: number; tokens: number }>();
  for (let cursor = new Date(since); cursor <= new Date(); cursor.setDate(cursor.getDate() + 1)) {
    buckets.set(dayKey(cursor), { messages: 0, tokens: 0 });
  }
  for (const message of recentMessages) {
    const key = dayKey(message.createdAt);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.messages += 1;
    bucket.tokens += (message.promptTokens ?? 0) + (message.completionTokens ?? 0);
  }

  const failed = recentMessages.filter((message) => message.status === "FAILED").length;
  const cancelled = recentMessages.filter((message) => message.status === "CANCELLED").length;

  return NextResponse.json({
    days,
    totals: {
      messages: aggregate._count._all,
      conversations: conversationCount,
      promptTokens: aggregate._sum.promptTokens ?? 0,
      completionTokens: aggregate._sum.completionTokens ?? 0,
      totalTokens: (aggregate._sum.promptTokens ?? 0) + (aggregate._sum.completionTokens ?? 0),
      failed,
      cancelled,
    },
    perModel: perModelRows.map((row) => ({
      model: row.model ?? "unknown",
      messages: row._count._all,
      promptTokens: row._sum.promptTokens ?? 0,
      completionTokens: row._sum.completionTokens ?? 0,
    })),
    perDay: [...buckets.entries()].map(([date, value]) => ({ date, ...value })),
  });
});
