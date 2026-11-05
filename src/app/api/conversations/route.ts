import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRateLimitedUser } from "@/lib/api";
import { createConversation, listConversations } from "@/lib/conversations";
import { toConversationDto } from "@/lib/dto";
import { route } from "@/lib/errors";
import { parseSearchParams, readJsonBody, conversationCreateSchema } from "@/lib/validation";

const listQuerySchema = z.object({
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = route(async (request: Request) => {
  const user = await requireRateLimitedUser("conversations");
  const query = parseSearchParams(new URL(request.url).searchParams, listQuerySchema);

  const rows = await listConversations(user.id, { query: query.q, limit: query.limit });
  return NextResponse.json({ conversations: rows.map(toConversationDto) });
});

export const POST = route(async (request: Request) => {
  const user = await requireRateLimitedUser("conversations");
  const body = await readJsonBody(request, conversationCreateSchema);
  const conversation = await createConversation(user.id, body.title);
  return NextResponse.json(
    {
      conversation: toConversationDto({
        id: conversation.id,
        title: conversation.title,
        model: conversation.model,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      }),
    },
    { status: 201 },
  );
});
