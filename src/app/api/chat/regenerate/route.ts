import { getEnv } from "@/lib/env";
import { AppError, RateLimitError, route } from "@/lib/errors";
import { hasActiveRun, runKey } from "@/lib/ai/active-runs";
import { startChatStream } from "@/lib/ai/stream-response";
import { loadProviderHistory } from "@/lib/history";
import { deleteLatestAssistantTurn, findOwnedConversation } from "@/lib/conversations";
import { resolveGenerationSettings } from "@/lib/preferences";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { chatRegenerateSchema, readJsonBody } from "@/lib/validation";

export const maxDuration = 60;

export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const env = getEnv();

  const limit = checkRateLimit(`chat:${user.id}`, env.CHAT_RATE_LIMIT_PER_MINUTE);
  if (!limit.ok) throw new RateLimitError(limit.retryAfterMs, "You are sending messages too quickly.");

  const body = await readJsonBody(request, chatRegenerateSchema);
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

  const { promptMessage } = await deleteLatestAssistantTurn(user.id, conversation.id);
  if (!promptMessage) {
    throw new AppError("There is no prompt to regenerate from", 409, "nothing_to_regenerate");
  }

  const history = await loadProviderHistory(conversation.id);

  return startChatStream({
    userId: user.id,
    conversationId: conversation.id,
    settings,
    history,
    budgetTokens: settings.contextWindow,
    requestSignal: request.signal,
    userMessageId: promptMessage.id,
    userTextForLabel: promptMessage.content,
    isFirstTurn: false,
    existingSummary: conversation.summary,
    summaryCovers: conversation.summaryCovers,
  });
});
