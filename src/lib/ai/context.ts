import { prisma } from "../db";
import { logger } from "../log";
import { estimateMessagesTokens, estimateTokens } from "../tokens";
import { completeText } from "./provider";
import type { ProviderMessage } from "./types";

export type HistoryMessage = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
};

export type BuiltContext = {
  messages: ProviderMessage[];
  includedCount: number;
  droppedCount: number;
  estimatedTokens: number;
  summaryApplied: boolean;
};

const SUMMARY_TOKEN_ALLOWANCE = 400;
const MIN_MESSAGES_BEFORE_SUMMARY = 4;
const SUMMARY_SOURCE_MESSAGE_LIMIT = 24;
const SUMMARY_SOURCE_CHAR_LIMIT = 700;

function toProviderRole(role: HistoryMessage["role"]): ProviderMessage["role"] {
  return role === "USER" ? "user" : role === "ASSISTANT" ? "assistant" : "system";
}

function summariseSource(history: HistoryMessage[]): string {
  const source = history.slice(-SUMMARY_SOURCE_MESSAGE_LIMIT);
  return source
    .map(
      (message) =>
        `${message.role}: ${
          message.content.length > SUMMARY_SOURCE_CHAR_LIMIT
            ? `${message.content.slice(0, SUMMARY_SOURCE_CHAR_LIMIT)}…`
            : message.content
        }`,
    )
    .join("\n");
}

async function refreshSummary(options: {
  conversationId: string;
  existingSummary: string | null;
  dropped: HistoryMessage[];
  model: string;
  summaryCovers: number;
  signal?: AbortSignal;
}): Promise<string | null> {
  const uncovered = options.dropped.slice(options.summaryCovers);
  if (uncovered.length < MIN_MESSAGES_BEFORE_SUMMARY && !options.existingSummary) return null;
  if (uncovered.length < MIN_MESSAGES_BEFORE_SUMMARY) return options.existingSummary;

  const prompt: ProviderMessage[] = [
    {
      role: "system",
      content:
        "Summarise the conversation so far in at most 8 bullet points. Keep decisions, open questions, names, numbers and code intent. Reply with the bullets only.",
    },
    {
      role: "user",
      content: options.existingSummary
        ? `Previous summary:\n${options.existingSummary}\n\nNewer messages to fold in:\n${summariseSource(uncovered)}`
        : `Messages to summarise:\n${summariseSource(uncovered)}`,
    },
  ];

  try {
    const summary = await completeText({
      model: options.model,
      messages: prompt,
      temperature: 0.2,
      maxOutputTokens: 320,
      signal: options.signal,
    });
    if (!summary) return options.existingSummary;
    await prisma.conversation.update({
      where: { id: options.conversationId },
      data: { summary, summaryCovers: options.dropped.length },
    });
    logger.info("context.summary_refreshed", {
      conversationId: options.conversationId,
      droppedCount: options.dropped.length,
    });
    return summary;
  } catch (error) {
    logger.warn("context.summary_failed", {
      conversationId: options.conversationId,
      message: error instanceof Error ? error.message : String(error),
    });
    return options.existingSummary;
  }
}

/**
 * Fills the provider context from the newest messages backwards until the token budget is
 * reached, then folds everything that fell out into a rolling summary so long conversations
 * keep their history available instead of silently losing it.
 */
export async function buildContext(options: {
  conversationId: string;
  conversationSummary: string | null;
  summaryCovers: number;
  systemPrompt: string;
  history: HistoryMessage[];
  budgetTokens: number;
  model: string;
  signal?: AbortSignal;
}): Promise<BuiltContext> {
  const systemTokens = estimateTokens(options.systemPrompt);
  const available = Math.max(
    256,
    options.budgetTokens - systemTokens - SUMMARY_TOKEN_ALLOWANCE,
  );

  const picked: HistoryMessage[] = [];
  let used = 0;
  for (let index = options.history.length - 1; index >= 0; index -= 1) {
    const message = options.history[index];
    const cost = estimateMessagesTokens([message]) + 2;
    if (picked.length > 0 && used + cost > available) break;
    if (picked.length === 0 && used + cost > available) {
      // Newest message alone is over budget: keep a tail of it rather than nothing.
      const maxChars = Math.max(200, (available - estimateTokens(message.role)) * 4);
      picked.unshift({ ...message, content: message.content.slice(-maxChars) });
      used += estimateTokens(message.content.slice(-maxChars));
      break;
    }
    picked.unshift(message);
    used += cost;
  }

  const dropped = options.history.slice(0, options.history.length - picked.length);
  let summary = options.conversationSummary;
  if (dropped.length > 0) {
    summary = await refreshSummary({
      conversationId: options.conversationId,
      existingSummary: options.conversationSummary,
      dropped,
      model: options.model,
      summaryCovers: options.summaryCovers,
      signal: options.signal,
    });
  }

  const messages: ProviderMessage[] = [{ role: "system", content: options.systemPrompt }];
  if (summary && dropped.length > 0) {
    messages.push({
      role: "system",
      content: `Summary of the earlier part of this conversation:\n${summary}`,
    });
  }
  for (const message of picked) {
    messages.push({ role: toProviderRole(message.role), content: message.content });
  }

  return {
    messages,
    includedCount: picked.length,
    droppedCount: dropped.length,
    estimatedTokens: estimateMessagesTokens(messages),
    summaryApplied: Boolean(summary && dropped.length > 0),
  };
}
