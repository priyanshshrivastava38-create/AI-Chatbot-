import { NextResponse } from "next/server";
import { requireRateLimitedUser } from "@/lib/api";
import { findOwnedConversation, getConversationMessages } from "@/lib/conversations";
import { toMessageDto } from "@/lib/dto";
import { route } from "@/lib/errors";
import { parseInput } from "@/lib/validation";
import { z } from "zod";

type Context = { params: Promise<{ id: string }> };

const formatSchema = z.object({
  format: z.enum(["markdown", "json"]).default("markdown"),
});

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "conversation";
}

function toMarkdown(title: string, messages: ReturnType<typeof toMessageDto>[], conversationId: string) {
  const lines = [
    `# ${title}`,
    "",
    `_Exported ${new Date().toISOString()} · ${messages.length} messages · id \`${conversationId}\`_`,
    "",
  ];
  for (const message of messages) {
    lines.push(`## ${message.role === "user" ? "User" : message.role === "assistant" ? "Assistant" : "System"}`);
    lines.push("");
    lines.push(message.content || "_(empty)_");
    if (message.attachments.length) {
      lines.push("");
      lines.push(
        `Attachments: ${message.attachments.map((attachment) => attachment.fileName).join(", ")}`,
      );
    }
    if (message.status === "CANCELLED") lines.push("", "_Response stopped by user._");
    if (message.status === "FAILED") lines.push("", `_Response failed: ${message.error ?? "unknown error"}`);
    lines.push("");
  }
  return lines.join("\n");
}

export const GET = route(async (request: Request, context: Context) => {
  const user = await requireRateLimitedUser("export", 30);
  const { id } = await context.params;
  const conversation = await findOwnedConversation(user.id, id);
  const query = parseInput(
    formatSchema,
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  const messages = (await getConversationMessages(user.id, conversation.id)).map(toMessageDto);
  const slug = slugify(conversation.title);

  if (query.format === "json") {
    return new NextResponse(
      JSON.stringify(
        {
          conversation: {
            id: conversation.id,
            title: conversation.title,
            createdAt: conversation.createdAt.toISOString(),
            updatedAt: conversation.updatedAt.toISOString(),
          },
          messages,
        },
        null,
        2,
      ),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${slug}.json"`,
        },
      },
    );
  }

  return new NextResponse(toMarkdown(conversation.title, messages, conversation.id), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.md"`,
    },
  });
});
