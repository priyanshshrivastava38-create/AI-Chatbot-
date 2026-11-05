import { NextResponse } from "next/server";
import { requireRateLimitedUser } from "@/lib/api";
import {
  deleteConversation,
  findOwnedConversation,
  getConversationMessages,
  updateConversation,
} from "@/lib/conversations";
import { toConversationDto, toMessageDto } from "@/lib/dto";
import { AppError, route } from "@/lib/errors";
import { isModelAllowed } from "@/lib/env";
import {
  conversationIdParams,
  conversationUpdateSchema,
  parseInput,
  readJsonBody,
} from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

async function resolveId(context: Context) {
  const { id } = await context.params;
  return parseInput(conversationIdParams, { id }).id;
}

export const GET = route(async (request: Request, context: Context) => {
  const user = await requireRateLimitedUser("conversations");
  const id = await resolveId(context);
  const conversation = await findOwnedConversation(user.id, id);
  const messages = await getConversationMessages(user.id, id);

  return NextResponse.json({
    conversation: toConversationDto({
      id: conversation.id,
      title: conversation.title,
      model: conversation.model,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    }),
    messages: messages.map(toMessageDto),
  });
});

export const PATCH = route(async (request: Request, context: Context) => {
  const user = await requireRateLimitedUser("conversations");
  const id = await resolveId(context);
  const body = await readJsonBody(request, conversationUpdateSchema);

  if (body.model && !isModelAllowed(body.model)) {
    throw new AppError("That model is not available on this server", 400, "model_not_allowed");
  }

  const conversation = await updateConversation(user.id, id, {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.model !== undefined ? { model: body.model } : {}),
  });

  return NextResponse.json({
    conversation: toConversationDto({
      id: conversation.id,
      title: conversation.title,
      model: conversation.model,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    }),
  });
});

export const DELETE = route(async (request: Request, context: Context) => {
  const user = await requireRateLimitedUser("conversations");
  const id = await resolveId(context);
  await deleteConversation(user.id, id);
  return NextResponse.json({ deleted: true, id });
});
