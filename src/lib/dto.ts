import type { Prisma } from "@/generated/prisma/client";

export type MessageDto = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status: "STREAMING" | "COMPLETED" | "CANCELLED" | "FAILED";
  model: string | null;
  error: string | null;
  suggestedFollowUps: string[];
  createdAt: string;
  usage: { promptTokens: number | null; completionTokens: number | null; latencyMs: number | null };
  attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number }[];
};

export type ConversationSummaryDto = {
  id: string;
  title: string;
  model: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

type MessageWithAttachments = Prisma.MessageGetPayload<{
  include: {
    attachments: {
      select: { id: true; fileName: true; mimeType: true; sizeBytes: true; createdAt: true };
    };
  };
}>;

function toIso(value: Date): string {
  return value.toISOString();
}

export function toMessageDto(message: MessageWithAttachments): MessageDto {
  return {
    id: message.id,
    role: message.role === "USER" ? "user" : message.role === "ASSISTANT" ? "assistant" : "system",
    content: message.content,
    status: message.status,
    model: message.model,
    error: message.error,
    suggestedFollowUps: message.suggestedFollowUps,
    createdAt: toIso(message.createdAt),
    usage: {
      promptTokens: message.promptTokens,
      completionTokens: message.completionTokens,
      latencyMs: message.latencyMs,
    },
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
    })),
  };
}

export function toConversationDto(row: {
  id: string;
  title: string;
  model: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { messages: number };
}): ConversationSummaryDto {
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    messageCount: row._count?.messages ?? 0,
  };
}
