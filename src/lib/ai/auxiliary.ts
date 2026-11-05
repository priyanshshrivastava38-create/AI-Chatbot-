import { logger } from "../log";
import { completeText } from "./provider";
import type { ProviderMessage } from "./types";

const TITLE_MAX_CHARS = 60;

function cleanTitle(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .replace(/^(title|title:)\s*/i, "")
    .replace(/[.?!]+$/g, "")
    .trim();
  if (!cleaned) return fallback;
  return cleaned.length > TITLE_MAX_CHARS ? `${cleaned.slice(0, TITLE_MAX_CHARS - 1)}…` : cleaned;
}

/** Short conversation label; falls back to the opening of the first message. */
export async function generateTitle(options: {
  model: string;
  userText: string;
  signal?: AbortSignal;
}): Promise<string> {
  const fallback = cleanTitle(options.userText, "New conversation");
  const prompt: ProviderMessage[] = [
    {
      role: "system",
      content:
        "You label conversations. Reply with only a title of 2 to 5 words that names the topic. No quotes, no trailing punctuation.",
    },
    {
      // Labelling from the question alone: small models otherwise lift a heading out of the
      // answer and name the conversation after a detail of it.
      role: "user",
      content: `Question: ${options.userText.slice(0, 600)}`,
    },
  ];

  try {
    const raw = await completeText({
      model: options.model,
      messages: prompt,
      temperature: 0.1,
      maxOutputTokens: 24,
      signal: options.signal,
    });
    return cleanTitle(raw, fallback);
  } catch (error) {
    logger.warn("title.generate_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

/**
 * Three follow-up questions to offer after an answer. Returns an empty list on any failure so
 * the UI simply omits the section rather than showing an error.
 */
export async function generateFollowUps(options: {
  model: string;
  userText: string;
  assistantText: string;
  signal?: AbortSignal;
}): Promise<string[]> {
  const prompt: ProviderMessage[] = [
    {
      role: "system",
      content:
        "Suggest exactly 3 short questions the user might reasonably ask next, one per line, without numbering, bullets or quotes. Each under 60 characters.",
    },
    {
      role: "user",
      content: `User asked: ${options.userText.slice(0, 500)}\n\nAssistant answered: ${options.assistantText.slice(0, 1200)}`,
    },
  ];

  try {
    const raw = await completeText({
      model: options.model,
      messages: prompt,
      temperature: 0.4,
      maxOutputTokens: 120,
      signal: options.signal,
    });
    const items = raw
      .split("\n")
      .map((line) => line.replace(/^[\s\-*\d.)("]+/, "").trim())
      .filter((line) => line.length > 3 && line.length <= 120)
      .slice(0, 3);
    return items;
  } catch (error) {
    logger.warn("followups.generate_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
