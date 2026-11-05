import { getEnv } from "@/lib/env";
import { AppError, RateLimitError, route } from "@/lib/errors";
import { hasActiveRun, runKey } from "@/lib/ai/active-runs";
import { startChatStream } from "@/lib/ai/stream-response";
import { loadProviderHistory } from "@/lib/history";
import { prisma } from "@/lib/db";
import { findOwnedConversation, createUserMessage } from "@/lib/conversations";
import { resolveGenerationSettings } from "@/lib/preferences";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { chatSendSchema, readJsonBody } from "@/lib/validation";

export const maxDuration = 60;

export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const env = getEnv();

  const limit = checkRateLimit(`chat:${user.id}`, env.CHAT_RATE_LIMIT_PER_MINUTE);
  if (!limit.ok) throw new RateLimitError(limit.retryAfterMs, "You are sending messages too quickly.");

  const body = await readJsonBody(request, chatSendSchema());
  const conversation = await findOwnedConversation(user.id, body.conversationId);

  if (hasActiveRun(runKey(user.id, conversation.id))) {
    throw new AppError(
      "A response is already being generated for this conversation",
      409,
      "generation_in_progress",
    );
  }

  const settings = await resolveGenerationSettings({
    userId: user.id,
    conversationModel: conversation.model,
    requestedModel: body.model,
    requestedTemperature: body.temperature,
    requestedMaxOutputTokens: body.maxOutputTokens,
  });

  const existingUserTurns = await prisma.message.count({
    where: { conversationId: conversation.id, role: "USER" },
  });

  const userMessage = await createUserMessage({
    conversationId: conversation.id,
    content: body.content,
    attachmentIds: body.attachmentIds,
    userId: user.id,
  });

  const history = await loadProviderHistory(conversation.id);

  return startChatStream({
    userId: user.id,
    conversationId: conversation.id,
    settings,
    history,
    budgetTokens: settings.contextWindow,
    requestSignal: request.signal,
    userMessageId: userMessage.id,
    userTextForLabel: body.content,
    isFirstTurn: existingUserTurns === 0,
    existingSummary: conversation.summary,
    summaryCovers: conversation.summaryCovers,
  });
});
