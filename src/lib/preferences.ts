import { DEFAULT_SYSTEM_PROMPT } from "./default-system-prompt";
import { prisma } from "./db";
import { getAiConfig, isModelAllowed } from "./env";

export type GenerationSettings = {
  model: string;
  temperature: number;
  maxOutputTokens: number;
  systemPrompt: string;
  sendOnEnter: boolean;
  contextWindow: number;
};

export async function ensurePreferences(userId: string) {
  const existing = await prisma.preference.findUnique({ where: { userId } });
  if (existing) return existing;
  try {
    return await prisma.preference.create({ data: { userId } });
  } catch {
    // Concurrent first-time access: fall back to the row that won the race.
    return (await prisma.preference.findUnique({ where: { userId } }))!;
  }
}

export async function getPreferences(userId: string): Promise<GenerationSettings> {
  const row = await ensurePreferences(userId);
  const config = getAiConfig();
  const model =
    row.defaultModel && isModelAllowed(row.defaultModel) ? row.defaultModel : config.defaultModel;
  return {
    model,
    temperature: row.temperature,
    maxOutputTokens: row.maxOutputTokens,
    systemPrompt: row.systemPrompt?.trim() ? row.systemPrompt : DEFAULT_SYSTEM_PROMPT,
    sendOnEnter: row.sendOnEnter,
    contextWindow: row.contextWindow,
  };
}

/**
 * Settings precedence for a single turn: request override, then the conversation's own
 * model, then the user's saved preferences, then the provider default.
 */
export async function resolveGenerationSettings(options: {
  userId: string;
  conversationModel?: string | null;
  requestedModel?: string;
  requestedTemperature?: number;
  requestedMaxOutputTokens?: number;
}): Promise<GenerationSettings> {
  const base = await getPreferences(options.userId);
  const candidate = options.requestedModel ?? options.conversationModel;
  const model = candidate && isModelAllowed(candidate) ? candidate : base.model;
  return {
    ...base,
    model,
    temperature: options.requestedTemperature ?? base.temperature,
    maxOutputTokens: options.requestedMaxOutputTokens ?? base.maxOutputTokens,
  };
}
