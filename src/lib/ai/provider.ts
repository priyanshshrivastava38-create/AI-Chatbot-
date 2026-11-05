import OpenAI from "openai";
import { getAiConfig } from "../env";
import { ProviderError } from "../errors";
import { logger } from "../log";
import { estimateTokens } from "../tokens";
import type { ProviderMessage } from "./types";

export type Usage = {
  promptTokens: number;
  completionTokens: number;
  estimated: boolean;
};

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "usage"; usage: Usage };

let cachedClient: OpenAI | undefined;

function getClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const config = getAiConfig();
  cachedClient = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    organization: getEnvOrNull("OPENAI_ORG_ID"),
    timeout: config.timeoutMs,
    maxRetries: 2,
  });
  return cachedClient;
}

function getEnvOrNull(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

/**
 * Turns an SDK/provider failure into a client-safe message. Details stay in the server log
 * so a raw upstream error body (which can echo prompt content) never reaches the browser.
 */
function describeProviderFailure(error: unknown): string {
  // The SDK's connection failures subclass APIError with no HTTP status, so they have to be
  // matched first — otherwise a provider that is simply unreachable reads as "HTTP unknown".
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return "The AI provider took too long to answer. Try again, or shorten the message.";
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return "Could not reach the AI provider. Check that the service is running, then retry.";
  }
  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    if (status === 401 || status === 403) {
      return "The AI provider rejected the credentials configured on this server.";
    }
    if (status === 429) return "The AI provider is rate limiting this server. Try again shortly.";
    if (status === 404 || status === 400) {
      return `The AI provider rejected the request${error.message ? `: ${truncate(error.message, 180)}` : "."}`;
    }
    if (status === undefined) return "The AI provider request failed before it returned a status.";
    return `The AI provider returned an error (HTTP ${status}).`;
  }
  if (error instanceof Error && error.name === "AbortError") return "Request cancelled.";
  return "The AI provider request failed.";
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function buildRequest(options: {
  model: string;
  messages: ProviderMessage[];
  temperature: number;
  maxOutputTokens: number;
  stream: boolean;
}) {
  const config = getAiConfig();
  const params: Record<string, unknown> = {
    model: options.model,
    messages: options.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    temperature: options.temperature,
    max_tokens: options.maxOutputTokens,
    stream: options.stream,
  };
  if (options.stream && config.provider === "openai") {
    // OpenAI only reports token usage on streamed calls when asked explicitly.
    params.stream_options = { include_usage: true };
  }
  return params as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;
}

/**
 * Streams a completion from the configured provider. Yields text deltas as they arrive;
 * aborting `signal` cancels the upstream HTTP request.
 */
export async function* streamCompletion(options: {
  model: string;
  messages: ProviderMessage[];
  temperature: number;
  maxOutputTokens: number;
  signal?: AbortSignal;
}): AsyncGenerator<StreamEvent> {
  const startedAt = Date.now();
  let stream: Awaited<ReturnType<OpenAI["chat"]["completions"]["create"]>> | undefined;
  let textSoFar = "";

  try {
    stream = (await getClient().chat.completions.create(buildRequest({ ...options, stream: true }), {
      signal: options.signal,
    })) as Awaited<ReturnType<OpenAI["chat"]["completions"]["create"]>>;
  } catch (error) {
    logger.error("provider.stream_open_failed", {
      model: options.model,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new ProviderError(describeProviderFailure(error));
  }

  let reportedUsage: Usage | undefined;
  try {
    for await (const chunk of stream as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        textSoFar += delta;
        yield { type: "delta", text: delta };
      }
      const usage = (chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number } })
        .usage;
      if (usage && (usage.prompt_tokens || usage.completion_tokens)) {
        reportedUsage = {
          promptTokens: usage.prompt_tokens ?? 0,
          completionTokens: usage.completion_tokens ?? 0,
          estimated: false,
        };
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    logger.error("provider.stream_iteration_failed", {
      model: options.model,
      durationMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new ProviderError(describeProviderFailure(error));
  }

  yield {
    type: "usage",
    usage:
      reportedUsage ??
      ({
        promptTokens: estimateTokens(options.messages.map((m) => m.content).join(" ")),
        completionTokens: estimateTokens(textSoFar),
        estimated: true,
      } satisfies Usage),
  };
}

/** Single-shot, non-streaming call used for titles, summaries and follow-up suggestions. */
export async function completeText(options: {
  model: string;
  messages: ProviderMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}): Promise<string> {
  try {
    const completion = (await getClient().chat.completions.create(
      buildRequest({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxOutputTokens ?? 256,
        stream: false,
      }),
      { signal: options.signal },
    )) as unknown as {
      choices?: { message?: { content?: string } }[];
    };
    return completion.choices?.[0]?.message?.content?.trim() ?? "";
  } catch (error) {
    logger.warn("provider.completion_failed", {
      model: options.model,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new ProviderError(describeProviderFailure(error));
  }
}

export async function listAvailableModels(): Promise<string[]> {
  try {
    const models = await getClient().models.list();
    const ids = models.data.map((model) => model.id).filter(Boolean);
    const config = getAiConfig();
    const filtered = config.allowedModels.length
      ? ids.filter((id) => config.allowedModels.includes(id))
      : ids;
    return Array.from(new Set([config.defaultModel, ...filtered]));
  } catch (error) {
    logger.warn("provider.model_list_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return [getAiConfig().defaultModel];
  }
}
