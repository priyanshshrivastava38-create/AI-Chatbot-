"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  PauseCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useClientRendered } from "@/lib/use-client-rendered";
import type { Message } from "@/types/chat";
import { Markdown } from "./markdown";

const LONG_MESSAGE_CHARS = 700;

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Clock times depend on the viewer's timezone, which the server cannot know. */
function Timestamp({ iso, className }: { iso: string; className?: string }) {
  const mounted = useClientRendered();
  return <span className={cn("tabular-nums", className)}>{mounted ? formatTime(iso) : ""}</span>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Live "thinking" state until the first token lands, then a quiet caret in the text. */
function TypingIndicator() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 py-1 text-muted-foreground" aria-label="Assistant is thinking">
      <span className="flex items-center gap-1">
        <span className="size-1.5 animate-bubble rounded-full bg-muted-foreground/70 [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bubble rounded-full bg-muted-foreground/70 [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bubble rounded-full bg-muted-foreground/70" />
      </span>
      <span className="text-xs">
        Thinking{elapsed >= 2 ? ` · ${elapsed}s` : ""}
      </span>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Your browser blocked the clipboard. Select the text and copy manually.");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      aria-label={label}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** Keeps a wall of pasted text from pushing the whole thread off screen. */
function CollapsibleText({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > LONG_MESSAGE_CHARS;
  const shown = isLong && !expanded ? `${content.slice(0, LONG_MESSAGE_CHARS)}…` : content;

  return (
    <>
      <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{shown}</p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium underline-offset-2 hover:underline"
        >
          <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
          {expanded ? "Show less" : `Show all ${content.length.toLocaleString()} characters`}
        </button>
      )}
    </>
  );
}

type MessageRowProps = {
  message: Message;
  canRegenerate: boolean;
  onRegenerate: () => void;
  onRetry: () => void;
  onSelectFollowUp: (question: string) => void;
  followUpsEnabled: boolean;
};

export function MessageRow({
  message,
  canRegenerate,
  onRegenerate,
  onRetry,
  onSelectFollowUp,
  followUpsEnabled,
}: MessageRowProps) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "STREAMING";

  if (isUser) {
    return (
      <div className="group flex flex-col items-end gap-1 py-3">
        {message.attachments.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
            {message.attachments.map((attachment) => (
              <span
                key={attachment.id}
                className="inline-flex max-w-full items-center gap-1 truncate rounded-md border bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground"
              >
                {attachment.fileName}
                {attachment.sizeBytes ? ` · ${formatBytes(attachment.sizeBytes)}` : ""}
              </span>
            ))}
          </div>
        )}
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground">
          <CollapsibleText content={message.content} />
        </div>
        <div className="flex items-center gap-2 pr-1 text-[11px] text-muted-foreground">
          <Timestamp iso={message.createdAt} />
          <span className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
            <CopyButton text={message.content} label="Copy your message" />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 py-3">
      <div
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors",
          isStreaming && "border-foreground/25 text-foreground",
        )}
        aria-hidden
      >
        <Sparkles className="size-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div
          aria-live={isStreaming ? "polite" : undefined}
          className={cn("text-[15px] leading-relaxed", isStreaming && message.content === "" && "text-muted-foreground")}
        >
          {message.content === "" && isStreaming ? (
            <TypingIndicator />
          ) : (
            <div className={cn(isStreaming && "streaming-caret")}>
              <Markdown content={message.content} />
            </div>
          )}
        </div>

        {message.status === "CANCELLED" && (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
            <PauseCircle className="size-3.5 shrink-0" /> You stopped this response. Partial answer is kept.
          </p>
        )}

        {message.status === "FAILED" && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">{message.error ?? "The assistant could not answer."}</span>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 font-medium transition-colors hover:bg-destructive/10"
            >
              <RefreshCw className="size-3" /> Try again
            </button>
          </div>
        )}

        {message.suggestedFollowUps.length > 0 && !isStreaming && followUpsEnabled && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Ask a follow-up
            </p>
            <div className="flex flex-wrap gap-2">
              {message.suggestedFollowUps.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => onSelectFollowUp(question)}
                  className="rounded-full border px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isStreaming && (
          <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px] text-muted-foreground">
            <CopyButton text={message.content} label="Copy response" />
            {canRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label="Regenerate response"
              >
                <RefreshCw className="size-3.5" /> Regenerate
              </button>
            )}
            <Timestamp iso={message.createdAt} className="ml-1" />
            {(message.model || message.usage.completionTokens) && (
              <span
                className="truncate font-mono"
                title={
                  message.usage.completionTokens
                    ? `${message.usage.promptTokens ?? 0} prompt tokens in · ${message.usage.completionTokens} out${
                        message.usage.latencyMs ? ` · ${Math.round(message.usage.latencyMs / 100) / 10}s` : ""
                      }`
                    : undefined
                }
              >
                {message.model ? ` · ${message.model}` : ""}
                {message.usage.completionTokens
                  ? ` · ${((message.usage.promptTokens ?? 0) + message.usage.completionTokens).toLocaleString()} tok`
                  : ""}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
