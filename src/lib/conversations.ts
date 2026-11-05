import { rm } from "node:fs/promises";
import { prisma } from "./db";
import { AppError, NotFoundError } from "./errors";
import { resolveUploadPath } from "./uploads";

export type ConversationRow = Awaited<ReturnType<typeof findOwnedConversation>>;

/**
 * Ownership is part of the lookup itself, so every caller is scoped to the signed-in user and
 * a foreign id and a non-existent id both produce the same 404.
 */
export async function findOwnedConversation(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });
  if (!conversation) throw new NotFoundError("Conversation not found");
  return conversation;
}

export async function listConversations(userId: string, options?: { query?: string; limit?: number }) {
  const limit = Math.min(Math.max(options?.limit ?? 60, 1), 200);
  const query = options?.query?.trim();

  const where = query
    ? {
        userId,
        OR: [
          { title: { contains: query, mode: "insensitive" as const } },
          { messages: { some: { content: { contains: query, mode: "insensitive" as const } } } },
        ],
      }
    : { userId };

  return prisma.conversation.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      title: true,
      model: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
}

export async function getConversationMessages(userId: string, conversationId: string) {
  await findOwnedConversation(userId, conversationId);
  // A server restart mid-generation leaves a STREAMING row that will never be written again.
  await prisma.message.updateMany({
    where: { conversationId, status: "STREAMING" },
    data: { status: "CANCELLED" },
  });
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      attachments: {
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
      },
    },
  });
}

export async function createConversation(userId: string, title?: string) {
  return prisma.conversation.create({
    data: { userId, title: title ?? "New conversation" },
  });
}

export async function updateConversation(
  userId: string,
  conversationId: string,
  patch: { title?: string; model?: string },
) {
  await findOwnedConversation(userId, conversationId);
  return prisma.conversation.update({
    where: { id: conversationId },
    data: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
    },
  });
}

export async function deleteConversation(userId: string, conversationId: string) {
  const conversation = await findOwnedConversation(userId, conversationId);
  const attachments = await prisma.attachment.findMany({
    where: { conversationId: conversation.id },
    select: { storageKey: true },
  });

  await prisma.conversation.delete({ where: { id: conversation.id } });

  // Cascade removes the rows; the bytes on disk are ours to clean up.
  await Promise.all(
    attachments.map(async (attachment) => {
      try {
        await rm(resolveUploadPath(attachment.storageKey), { force: true });
      } catch {
        // A missing file is not worth failing the delete over.
      }
    }),
  );
}

/** Message writes do not bump the parent row, so recency ordering needs an explicit touch. */
export async function touchConversation(conversationId: string) {
  return prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });
}

export async function createAssistantPlaceholder(conversationId: string, model: string) {
  return prisma.message.create({
    data: { conversationId, role: "ASSISTANT", content: "", status: "STREAMING", model },
  });
}

export async function createUserMessage(input: {
  conversationId: string;
  content: string;
  attachmentIds?: string[];
  userId: string;
}) {
  const message = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      role: "USER",
      content: input.content,
      status: "COMPLETED",
    },
  });
  if (input.attachmentIds?.length) {
    await prisma.attachment.updateMany({
      where: { id: { in: input.attachmentIds }, userId: input.userId },
      data: { messageId: message.id },
    });
  }
  return message;
}

export async function finalizeAssistantMessage(input: {
  messageId: string;
  content: string;
  status: "COMPLETED" | "CANCELLED" | "FAILED";
  promptTokens?: number | null;
  completionTokens?: number | null;
  latencyMs?: number | null;
  error?: string | null;
  suggestedFollowUps?: string[];
}) {
  return prisma.message.update({
    where: { id: input.messageId },
    data: {
      content: input.content,
      status: input.status,
      promptTokens: input.promptTokens ?? null,
      completionTokens: input.completionTokens ?? null,
      latencyMs: input.latencyMs ?? null,
      error: input.error ?? null,
      suggestedFollowUps: input.suggestedFollowUps ?? [],
    },
  });
}

/** Removes the assistant replies of the latest turn so a regenerated answer replaces them. */
export async function deleteLatestAssistantTurn(userId: string, conversationId: string) {
  await findOwnedConversation(userId, conversationId);
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, role: true, content: true },
  });

  const staleIds: string[] = [];
  for (const message of messages) {
    if (message.role === "ASSISTANT") staleIds.push(message.id);
    else break;
  }
  if (staleIds.length === 0) {
    throw new AppError("There is no assistant reply to regenerate", 409, "nothing_to_regenerate");
  }
  const lastUserMessage = messages.find((message) => message.role === "USER");
  await prisma.message.deleteMany({ where: { id: { in: staleIds } } });
  return { promptMessage: lastUserMessage ?? null, removedCount: staleIds.length };
}

export async function loadAttachmentContext(userId: string, attachmentIds: string[]) {
  if (attachmentIds.length === 0) return [];
  return prisma.attachment.findMany({
    where: { id: { in: attachmentIds }, userId },
    select: { id: true, fileName: true, mimeType: true, extractedText: true, textTruncated: true },
  });
}
