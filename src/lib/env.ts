import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "is required"),
  AUTH_SECRET: z.string().min(16, "must be at least 16 characters"),
  AI_PROVIDER: z.enum(["openai", "ollama"]).default("openai"),
  OPENAI_BASE_URL: z.url().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_ORG_ID: z.string().optional(),
  AI_DEFAULT_MODEL: z.string().min(1).optional(),
  AI_MODEL_ALLOWLIST: z.string().optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  MAX_INPUT_CHARS: z.coerce.number().int().positive().default(16_000),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  CHAT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
  API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  UPLOAD_DIR: z.string().min(1).default("uploads"),
});

export type Env = z.infer<typeof EnvSchema>;

export class EnvConfigError extends Error {
  constructor(issues: string) {
    super(`Invalid environment configuration: ${issues}`);
    this.name = "EnvConfigError";
  }
}

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
      .join("; ");
    throw new EnvConfigError(issues);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

export type AiConfig = {
  provider: Env["AI_PROVIDER"];
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  allowedModels: string[];
  timeoutMs: number;
  maxInputChars: number;
  maxUploadBytes: number;
  uploadDir: string;
};

let cachedAiConfig: AiConfig | undefined;

export function getAiConfig(): AiConfig {
  if (cachedAiConfig) return cachedAiConfig;
  const env = getEnv();

  const isOllama = env.AI_PROVIDER === "ollama";
  const baseUrl =
    env.OPENAI_BASE_URL ?? (isOllama ? "http://127.0.0.1:11434/v1" : "https://api.openai.com/v1");

  if (!isOllama && !env.OPENAI_API_KEY) {
    throw new EnvConfigError("AI_PROVIDER=openai requires OPENAI_API_KEY to be set");
  }

  const allowedModels = (env.AI_MODEL_ALLOWLIST ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  cachedAiConfig = {
    provider: env.AI_PROVIDER,
    baseUrl,
    apiKey: env.OPENAI_API_KEY ?? "not-required",
    defaultModel: env.AI_DEFAULT_MODEL ?? (isOllama ? "qwen2.5:3b" : "gpt-4o-mini"),
    allowedModels,
    timeoutMs: env.AI_TIMEOUT_MS,
    maxInputChars: env.MAX_INPUT_CHARS,
    maxUploadBytes: env.MAX_UPLOAD_BYTES,
    uploadDir: env.UPLOAD_DIR,
  };
  return cachedAiConfig;
}

export function isModelAllowed(model: string): boolean {
  const { allowedModels } = getAiConfig();
  return allowedModels.length === 0 || allowedModels.includes(model);
}
