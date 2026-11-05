export type ProviderRole = "system" | "user" | "assistant";

export type ProviderMessage = {
  role: ProviderRole;
  content: string;
};

export type UsagePayload = {
  promptTokens: number;
  completionTokens: number;
  estimated: boolean;
  latencyMs: number;
};

/** Events emitted over SSE from POST /api/chat and POST /api/chat/regenerate. */
export type ChatStreamEvent =
  | {
      type: "meta";
      conversationId: string;
      userMessageId?: string;
      assistantMessageId: string;
      model: string;
    }
  | { type: "delta"; text: string }
  | { type: "title"; title: string }
  | { type: "followUps"; items: string[] }
  | { type: "done"; usage: UsagePayload; status: "COMPLETED" | "CANCELLED" | "FAILED" }
  | { type: "error"; code: string; message: string };
