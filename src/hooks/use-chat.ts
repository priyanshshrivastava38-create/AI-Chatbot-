"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readSseStream } from "@/lib/sse-client";
import {
  createAssistantPlaceholder,
  type AttachmentDto,
  type Message,
  type StreamEvent,
} from "@/types/chat";

export type ChatPhase = "idle" | "submitting" | "streaming" | "error";

export type GenerationParams = {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

type UseChatOptions = {
  conversationId: string;
  initialMessages: Message[];
  params?: GenerationParams;
  onTitle?: (title: string) => void;
  onStreamEnd?: () => void;
};

function makeOptimisticUserMessage(content: string, attachments: AttachmentDto[]): Message {
  return {
    id: `pending-user-${crypto.randomUUID()}`,
    role: "user",
    content,
    status: "COMPLETED",
    model: null,
    error: null,
    suggestedFollowUps: [],
    createdAt: new Date().toISOString(),
    usage: { promptTokens: null, completionTokens: null, latencyMs: null },
    attachments,
  };
}

/**
 * Owns the message list and the streaming lifecycle for one conversation: send, stop,
 * regenerate. Message ids are swapped from optimistic placeholders to database ids when the
 * server reports them, so a reload always reconciles with what was persisted.
 */
export function useChat(options: UseChatOptions) {
  const { conversationId } = options;
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(options.initialMessages);
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const assistantIdRef = useRef<string | null>(null);
  const pendingUserMessageIdRef = useRef<string | null>(null);
  const paramsRef = useRef<GenerationParams>(options.params ?? {});
  const initialMessagesRef = useRef<Message[]>(options.initialMessages);
  const callbacksRef = useRef({ onTitle: options.onTitle, onStreamEnd: options.onStreamEnd });

  // Latest props live in refs so the long-lived stream callbacks never read a stale closure.
  useEffect(() => {
    paramsRef.current = options.params ?? {};
    initialMessagesRef.current = options.initialMessages;
    callbacksRef.current = { onTitle: options.onTitle, onStreamEnd: options.onStreamEnd };
  });

  // The page component is reused when only the conversation id changes, so reload the transcript.
  useEffect(() => {
    setMessages(initialMessagesRef.current);
    setPhase("idle");
    setError(null);
    assistantIdRef.current = null;
  }, [conversationId]);

  // A mounted conversation never keeps a half-open request after unmount.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const updateAssistant = useCallback((updater: (message: Message) => Message) => {
    const targetId = assistantIdRef.current;
    if (!targetId) return;
    setMessages((previous) =>
      previous.map((message) => (message.id === targetId ? updater(message) : message)),
    );
  }, []);

  const applyEvent = useCallback(
    (event: StreamEvent) => {
      switch (event.type) {
        case "meta": {
          const previousAssistantId = assistantIdRef.current;
          assistantIdRef.current = event.assistantMessageId;
          setMessages((previous) =>
            previous.map((message) => {
              if (previousAssistantId && message.id === previousAssistantId) {
                return { ...message, id: event.assistantMessageId, model: event.model };
              }
              if (
                pendingUserMessageIdRef.current &&
                message.id === pendingUserMessageIdRef.current &&
                event.userMessageId
              ) {
                return { ...message, id: event.userMessageId, attachments: [] };
              }
              return message;
            }),
          );
          pendingUserMessageIdRef.current = null;
          break;
        }
        case "delta":
          updateAssistant((message) => ({ ...message, content: message.content + event.text }));
          break;
        case "title":
          callbacksRef.current.onTitle?.(event.title);
          break;
        case "followUps":
          updateAssistant((message) => ({ ...message, suggestedFollowUps: event.items }));
          break;
        case "done":
          updateAssistant((message) => ({
            ...message,
            status: event.status,
            usage: {
              promptTokens: event.usage.promptTokens,
              completionTokens: event.usage.completionTokens,
              latencyMs: event.usage.latencyMs,
            },
          }));
          break;
        case "error":
          updateAssistant((message) => ({
            ...message,
            status: "FAILED",
            error: event.message,
          }));
          setError(event.message);
          setPhase("error");
          break;
      }
    },
    [updateAssistant],
  );

  const runTurn = useCallback(
    async (endpoint: string, payload: Record<string, unknown>) => {
      const placeholderId = `pending-assistant-${crypto.randomUUID()}`;
      const controller = new AbortController();
      controllerRef.current = controller;
      assistantIdRef.current = placeholderId;
      setError(null);
      setPhase("submitting");

      setMessages((previous) => [
        ...previous,
        createAssistantPlaceholder(placeholderId, typeof payload.model === "string" ? payload.model : null),
      ]);

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          const detail = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          const message =
            detail?.error?.message ?? `Request failed (HTTP ${response.status}). Please try again.`;
          setMessages((previous) =>
            previous.filter((item) => item.id !== placeholderId && item.id !== assistantIdRef.current),
          );
          assistantIdRef.current = null;
          setError(message);
          setPhase("error");
          if (response.status === 401) router.push("/login");
          return;
        }

        if (!response.body) {
          throw new Error("This browser does not support streaming responses.");
        }

        setPhase("streaming");
        for await (const frame of readSseStream(response.body)) {
          let event: StreamEvent;
          try {
            event = JSON.parse(frame.data) as StreamEvent;
          } catch {
            continue;
          }
          applyEvent(event);
        }

        setPhase((current) => (current === "error" ? "error" : "idle"));
      } catch (caught) {
        const aborted =
          caught instanceof Error &&
          (caught.name === "AbortError" || caught.name === "APIUserAbortError" || controller.signal.aborted);

        if (aborted) {
          updateAssistant((message) => ({ ...message, status: "CANCELLED" }));
          setPhase("idle");
        } else {
          const messageText =
            caught instanceof Error ? caught.message : "The connection to the assistant was lost.";
          updateAssistant((message) => ({ ...message, status: "FAILED", error: messageText }));
          setError(messageText);
          setPhase("error");
        }
      } finally {
        controllerRef.current = null;
        callbacksRef.current.onStreamEnd?.();
      }
    },
    [applyEvent, router, updateAssistant],
  );

  const send = useCallback(
    async (content: string, attachments: AttachmentDto[] = []) => {
      const trimmed = content.trim();
      if (!trimmed || controllerRef.current) return;

      const optimistic = makeOptimisticUserMessage(trimmed, attachments);
      pendingUserMessageIdRef.current = optimistic.id;
      setMessages((previous) => [...previous, optimistic]);

      await runTurn("/api/chat", {
        conversationId,
        content: trimmed,
        ...(attachments.length ? { attachmentIds: attachments.map((item) => item.id) } : {}),
        ...paramsRef.current,
      });
    },
    [conversationId, runTurn],
  );

  const regenerate = useCallback(async () => {
    if (controllerRef.current) return;
    setMessages((previous) => {
      const next = [...previous];
      while (next.length > 0 && next[next.length - 1].role === "assistant") next.pop();
      return next;
    });
    await runTurn("/api/chat/regenerate", { conversationId, ...paramsRef.current });
  }, [conversationId, runTurn]);

  const stop = useCallback(async () => {
    if (!controllerRef.current) return;
    try {
      await fetch("/api/chat/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
    } catch {
      // The abort below still ends the local stream.
    }
    controllerRef.current.abort();
  }, [conversationId]);

  /** Retry the failed turn in place: regenerate when an assistant reply is already present. */
  const retry = useCallback(async () => {
    if (controllerRef.current) return;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && (last.status === "FAILED" || last.status === "CANCELLED")) {
      setMessages((previous) => previous.slice(0, -1));
      await runTurn("/api/chat/regenerate", { conversationId, ...paramsRef.current });
      return;
    }
    const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
    if (lastUserMessage) await send(lastUserMessage.content);
  }, [conversationId, messages, runTurn, send]);

  const isBusy = phase === "submitting" || phase === "streaming";

  return { messages, phase, error, isBusy, send, stop, regenerate, retry, setError };
}
