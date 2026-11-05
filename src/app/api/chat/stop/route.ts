import { NextResponse } from "next/server";
import { z } from "zod";
import { abortRun, runKey } from "@/lib/ai/active-runs";
import { findOwnedConversation } from "@/lib/conversations";
import { route } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { readJsonBody } from "@/lib/validation";

const stopSchema = z.object({ conversationId: z.string().min(1).max(64) });

export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const body = await readJsonBody(request, stopSchema);
  await findOwnedConversation(user.id, body.conversationId);

  const stopped = abortRun(runKey(user.id, body.conversationId));
  return NextResponse.json({ stopped });
});
