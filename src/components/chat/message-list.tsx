"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClientRendered } from "@/lib/use-client-rendered";
import type { Message } from "@/types/chat";
import { MessageRow } from "./message-row";

const STICK_THRESHOLD_PX = 140;

type MessageListProps = {
  messages: Message[];
  isStreaming: boolean;
  onRegenerate: () => void;
  onRetry: () => void;
  onSelectFollowUp: (question: string) => void;
};

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const startOf = (value: Date) => new Date(value.setHours(0, 0, 0, 0)).getTime();
  const days = Math.floor((startOf(today) - startOf(date)) / 86_400_000);

  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString([], { weekday: "long" });
  return date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

export function MessageList({
  messages,
  isStreaming,
  onRegenerate,
  onRetry,
  onSelectFollowUp,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const mounted = useClientRendered();

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    const stuck = distance < STICK_THRESHOLD_PX;
    stickToBottomRef.current = stuck;
    setShowJumpButton(!stuck);
  }, []);

  const lastMessage = messages[messages.length - 1];
  const streamingLength = isStreaming ? lastMessage?.content.length ?? 0 : 0;
  const firstMessageId = messages[0]?.id;

  // Follow new tokens while the user is at the bottom; stop the moment they scroll up.
  useEffect(() => {
    if (stickToBottomRef.current) scrollToBottom();
  }, [messages.length, streamingLength, scrollToBottom]);

  // Switching transcript hides the jump pill immediately; the scroll handler keeps it in sync after.
  const [syncedFirstId, setSyncedFirstId] = useState(firstMessageId);
  if (syncedFirstId !== firstMessageId) {
    setSyncedFirstId(firstMessageId);
    setShowJumpButton(false);
  }

  useEffect(() => {
    stickToBottomRef.current = true;
    scrollToBottom();
  }, [scrollToBottom, firstMessageId]);

  const lastAssistantIndex = messages.reduce(
    (index, message, position) => (message.role === "assistant" ? position : index),
    -1,
  );

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto scroll-smooth"
        role="log"
        aria-label="Conversation"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-4 sm:px-6">
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const showDay = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);

            return (
              <div key={message.id}>
                {showDay && (
                  <div className="sticky top-0 z-10 -mx-4 flex justify-center py-3 sm:-mx-6">
                    <span className="rounded-full border bg-background/85 px-2.5 py-0.5 text-[11px] text-muted-foreground backdrop-blur">
                      {mounted ? dayLabel(message.createdAt) : ""}
                    </span>
                  </div>
                )}
                <MessageRow
                  message={message}
                  canRegenerate={index === lastAssistantIndex && !isStreaming}
                  onRegenerate={onRegenerate}
                  onRetry={onRetry}
                  onSelectFollowUp={onSelectFollowUp}
                  followUpsEnabled={index === lastAssistantIndex}
                />
              </div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          stickToBottomRef.current = true;
          setShowJumpButton(false);
          scrollToBottom("smooth");
        }}
        className={cn(
          "absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background/95 py-1.5 pr-3 pl-2.5 text-xs shadow-md backdrop-blur transition-all hover:bg-accent",
          showJumpButton
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-2 opacity-0",
        )}
        aria-label="Jump to the latest message"
      >
        <ArrowDown className="size-3.5" />
        {isStreaming ? "Resume live view" : "Latest"}
      </button>
    </div>
  );
}
