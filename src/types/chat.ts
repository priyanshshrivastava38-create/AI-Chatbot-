export type MessageRole = "user" | "assistant" | "system";

export type MessageStatus = "STREAMING" | "COMPLETED" | "CANCELLED" | "FAILED";

export type AttachmentDto = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type Message = {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  model: string | null;
  error: string | null;
  suggestedFollowUps: string[];
  createdAt: string;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    latencyMs: number | null;
  };
  attachments: AttachmentDto[];
};

export type ConversationSummary = {
  id: string;
  title: string;
  model: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type PreferencesDto = {
  model: string;
  temperature: number;
  maxOutputTokens: number;
  systemPrompt: string;
  sendOnEnter: boolean;
  contextWindow: number;
};

export type ModelsDto = {
  provider: string;
  models: string[];
  defaultModel: string;
  currentModel: string;
  limits: {
    temperature: { min: number; max: number };
    maxOutputTokens: { min: number; max: number };
    maxInputChars: number;
    maxUploadBytes: number;
  };
};

export type UsageDto = {
  days: number;
  totals: {
    messages: number;
    conversations: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    failed: number;
    cancelled: number;
  };
  perModel: { model: string; messages: number; promptTokens: number; completionTokens: number }[];
  perDay: { date: string; messages: number; tokens: number }[];
};

export type StreamEvent =
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
  | {
      type: "done";
      status: MessageStatus;
      usage: {
        promptTokens: number;
        completionTokens: number;
        estimated: boolean;
        latencyMs: number;
      };
    }
  | { type: "error"; code: string; message: string };

export function createAssistantPlaceholder(id: string, model: string | null = null): Message {
  return {
    id,
    role: "assistant",
    content: "",
    status: "STREAMING",
    model,
    error: null,
    suggestedFollowUps: [],
    createdAt: new Date().toISOString(),
    usage: { promptTokens: null, completionTokens: null, latencyMs: null },
    attachments: [],
  };
}
