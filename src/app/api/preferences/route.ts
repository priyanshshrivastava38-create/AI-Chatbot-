import { NextResponse } from "next/server";
import { requireRateLimitedUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { AppError, route } from "@/lib/errors";
import { isModelAllowed } from "@/lib/env";
import { getPreferences } from "@/lib/preferences";
import { preferencesUpdateSchema, readJsonBody } from "@/lib/validation";

export const GET = route(async () => {
  const user = await requireRateLimitedUser("preferences", 60);
  const preferences = await getPreferences(user.id);
  return NextResponse.json({ preferences });
});

export const PATCH = route(async (request: Request) => {
  const user = await requireRateLimitedUser("preferences", 60);
  const body = await readJsonBody(request, preferencesUpdateSchema);

  if (body.defaultModel && !isModelAllowed(body.defaultModel)) {
    throw new AppError("That model is not available on this server", 400, "model_not_allowed");
  }

  const updated = await prisma.preference.upsert({
    where: { userId: user.id },
    update: {
      ...(body.defaultModel !== undefined ? { defaultModel: body.defaultModel } : {}),
      ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
      ...(body.maxOutputTokens !== undefined ? { maxOutputTokens: body.maxOutputTokens } : {}),
      ...(body.systemPrompt !== undefined ? { systemPrompt: body.systemPrompt } : {}),
      ...(body.sendOnEnter !== undefined ? { sendOnEnter: body.sendOnEnter } : {}),
    },
    create: {
      userId: user.id,
      defaultModel: body.defaultModel ?? null,
      temperature: body.temperature ?? 0.7,
      maxOutputTokens: body.maxOutputTokens ?? 2048,
      systemPrompt: body.systemPrompt ?? null,
      sendOnEnter: body.sendOnEnter ?? true,
    },
  });

  return NextResponse.json({
    preferences: {
      model: updated.defaultModel,
      temperature: updated.temperature,
      maxOutputTokens: updated.maxOutputTokens,
      systemPrompt: updated.systemPrompt,
      sendOnEnter: updated.sendOnEnter,
      contextWindow: updated.contextWindow,
    },
  });
});
