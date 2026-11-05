import {
  createAssistantPlaceholder,
  finalizeAssistantMessage,
  touchConversation,
  updateConversation,
} from "../conversations";
import type { GenerationSettings } from "../preferences";
import { logger } from "../log";
import { estimateTokens } from "../tokens";
import { buildContext, type HistoryMessage } from "./context";
import { streamCompletion, type Usage } from "./provider";
import { generateFollowUps, generateTitle } from "./auxiliary";
import type { ChatStreamEvent, UsagePayload } from "./types";

export type RunTurnInput = {
  userId: string;
  conversationId: string;
  settings: GenerationSettings;
  history: HistoryMessage[];
  budgetTokens: number;
  signal: AbortSignal;
  userMessageId?: string;
  userTextForLabel: string;
  isFirstTurn: boolean;
  existingSummary: string | null;
  summaryCovers: number;
};

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "APIUserAbortError");
}

/**
 * Runs one assistant turn against the provider and yields SSE-ready events. The partial reply
 * is always persisted, whether the model finished, the user stopped it, or the provider failed.
 */
export async function* runChatTurn(input: RunTurnInput): AsyncGenerator<ChatStreamEvent> {
  const startedAt = Date.now();
  const assistant = await createAssistantPlaceholder(input.conversationId, input.settings.model);

  yield {
    type: "meta",
    conversationId: input.conversationId,
    userMessageId: input.userMessageId,
    assistantMessageId: assistant.id,
    model: input.settings.model,
  };

  const context = await buildContext({
    conversationId: input.conversationId,
    conversationSummary: input.existingSummary,
    summaryCovers: input.summaryCovers,
    systemPrompt: input.settings.systemPrompt,
    history: input.history,
    budgetTokens: input.budgetTokens,
    model: input.settings.model,
    signal: input.signal,
  });

  logger.info("chat.context_built", {
    conversationId: input.conversationId,
    includedCount: context.includedCount,
    droppedCount: context.droppedCount,
    estimatedTokens: context.estimatedTokens,
    summaryApplied: context.summaryApplied,
  });

  let accumulated = "";
  let usage: Usage | undefined;

  try {
    for await (const event of streamCompletion({
      model: input.settings.model,
      messages: context.messages,
      temperature: input.settings.temperature,
      maxOutputTokens: input.settings.maxOutputTokens,
      signal: input.signal,
    })) {
      if (event.type === "delta") {
        accumulated += event.text;
        yield { type: "delta", text: event.text };
      } else {
        usage = event.usage;
      }
    }
  } catch (error) {
    const cancelled = isAbortError(error) || input.signal.aborted;
    const latencyMs = Date.now() - startedAt;
    const message = cancelled
      ? null
      : error instanceof Error && error.name === "ProviderError"
        ? error.message
        : "The AI provider could not complete the request.";

    await finalizeAssistantMessage({
      messageId: assistant.id,
      content: accumulated,
      status: cancelled ? "CANCELLED" : "FAILED",
      promptTokens: usage?.promptTokens ?? null,
      completionTokens: usage?.completionTokens ?? (cancelled ? estimateTokens(accumulated) : null),
      latencyMs,
      error: message,
    });
    await touchConversation(input.conversationId);

    if (cancelled) {
      logger.info("chat.turn_cancelled", {
        conversationId: input.conversationId,
        characters: accumulated.length,
      });
      yield {
        type: "done",
        status: "CANCELLED",
        usage: {
          promptTokens: usage?.promptTokens ?? 0,
          completionTokens: usage?.completionTokens ?? 0,
          estimated: usage?.estimated ?? true,
          latencyMs,
        } satisfies UsagePayload,
      };
      return;
    }

    logger.error("chat.turn_failed", {
      conversationId: input.conversationId,
      message,
    });
    yield { type: "error", code: "provider_error", message: message ?? "Provider request failed." };
    return;
  }

  const latencyMs = Date.now() - startedAt;
  const usagePayload: UsagePayload = {
    promptTokens: usage?.promptTokens ?? 0,
    completionTokens: usage?.completionTokens ?? 0,
    estimated: usage?.estimated ?? true,
    latencyMs,
  };

  const followUps = accumulated.trim()
    ? await generateFollowUps({
        model: input.settings.model,
        userText: input.userTextForLabel,
        assistantText: accumulated,
        signal: AbortSignal.timeout(20_000),
      })
    : [];

  await finalizeAssistantMessage({
    messageId: assistant.id,
    content: accumulated,
    status: "COMPLETED",
    promptTokens: usagePayload.promptTokens,
    completionTokens: usagePayload.completionTokens,
    latencyMs,
    suggestedFollowUps: followUps,
  });
  await touchConversation(input.conversationId);

  if (input.isFirstTurn) {
    const title = await generateTitle({
      model: input.settings.model,
      userText: input.userTextForLabel,
      signal: AbortSignal.timeout(20_000),
    });
    await updateConversation(input.userId, input.conversationId, { title });
    yield { type: "title", title };
  }

  if (followUps.length > 0) {
    yield { type: "followUps", items: followUps };
  }

  yield { type: "done", status: "COMPLETED", usage: usagePayload };
}
