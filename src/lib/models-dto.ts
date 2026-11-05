import { listAvailableModels } from "./ai/provider";
import { getAiConfig } from "./env";
import { getPreferences } from "./preferences";
import type { ModelsDto } from "@/types/chat";

/** Model catalogue + generation limits for one user, shared by /api/models and the server layout. */
export async function buildModelsDto(userId: string): Promise<ModelsDto> {
  const config = getAiConfig();
  const [preferences, models] = await Promise.all([getPreferences(userId), listAvailableModels()]);

  return {
    provider: config.provider,
    models,
    defaultModel: config.defaultModel,
    currentModel: preferences.model,
    limits: {
      temperature: { min: 0, max: 2 },
      maxOutputTokens: { min: 64, max: 8192 },
      maxInputChars: config.maxInputChars,
      maxUploadBytes: config.maxUploadBytes,
    },
  };
}
