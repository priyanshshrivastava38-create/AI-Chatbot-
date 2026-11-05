import { prisma } from "./db";
import type { HistoryMessage } from "./ai/context";

const ATTACHMENT_CONTEXT_CHAR_LIMIT = 12_000;

type AttachmentLike = {
  fileName: string;
  extractedText: string | null;
  textTruncated: boolean;
};

/** Attachment bodies are folded into the prompt text so the model can see uploaded files. */
export function composeMessageContent(content: string, attachments: AttachmentLike[]): string {
  if (attachments.length === 0) return content;
  const blocks = attachments
    .filter((attachment) => Boolean(attachment.extractedText))
    .map((attachment) => {
      const text = (attachment.extractedText ?? "").slice(0, ATTACHMENT_CONTEXT_CHAR_LIMIT);
      const note = attachment.textTruncated ? " (content truncated)" : "";
      return `Attached file "${attachment.fileName}"${note}:\n"""${text}"""`;
    });
  if (blocks.length === 0) return content;
  return `${content}\n\n${blocks.join("\n\n")}`;
}

/**
 * Messages exactly as stored, with attachments folded in and blank rows (placeholders from an
 * interrupted run) removed, so the provider only ever sees real turns.
 */
export async function loadProviderHistory(conversationId: string): Promise<HistoryMessage[]> {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      role: true,
      content: true,
      status: true,
      attachments: { select: { fileName: true, extractedText: true, textTruncated: true } },
    },
  });

  return messages
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: composeMessageContent(message.content, message.attachments),
    }))
    .filter((message) => message.content.trim().length > 0);
}
