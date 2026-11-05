"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Paperclip, Send, Square, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AttachmentDto } from "@/types/chat";

const MAX_ATTACHMENTS = 5;

type PendingUpload = { id: string; fileName: string };

type ComposerProps = {
  conversationId: string;
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (content: string, attachments: AttachmentDto[]) => void;
  onStop: () => void;
  busy: boolean;
  sendOnEnter: boolean;
  maxChars: number;
  maxUploadBytes: number;
  autoFocus?: boolean;
};

export function Composer({
  conversationId,
  value,
  onValueChange,
  onSubmit,
  onStop,
  busy,
  sendOnEnter,
  maxChars,
  maxUploadBytes,
  autoFocus,
}: ComposerProps) {
  const [attachments, setAttachments] = useState<AttachmentDto[]>([]);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);

  const resize = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 224)}px`;
  }, []);

  useEffect(resize, [value, resize]);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const overLimit = value.length > maxChars;
  const uploading = pending.length > 0;
  const canSend = value.trim().length > 0 && !busy && !uploading && !overLimit;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    const content = value.trim();
    onSubmit(content, attachments);
    onValueChange("");
    setAttachments([]);
    requestAnimationFrame(resize);
  }, [attachments, canSend, onSubmit, onValueChange, resize, value]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      (sendOnEnter || event.metaKey || event.ctrlKey)
    ) {
      event.preventDefault();
      handleSend();
      return;
    }
    if (event.key === "Escape" && busy) {
      event.preventDefault();
      onStop();
    }
  };

  async function uploadFiles(fileList: FileList | File[] | null) {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;

    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      toast.error(`At most ${MAX_ATTACHMENTS} files per message.`);
      return;
    }

    const tooLarge = files.filter((file) => file.size > maxUploadBytes);
    for (const file of tooLarge) {
      toast.error(`${file.name} is larger than ${Math.round(maxUploadBytes / (1024 * 1024))} MB.`);
    }

    for (const file of files) {
      if (tooLarge.includes(file)) continue;
      const uploadId = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setPending((previous) => [...previous, { id: uploadId, fileName: file.name }]);
      try {
        const form = new FormData();
        form.append("conversationId", conversationId);
        form.append("file", file);
        const response = await fetch("/api/attachments", { method: "POST", body: form });
        if (!response.ok) {
          const detail = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(detail?.error?.message ?? `Upload failed (HTTP ${response.status}).`);
        }
        const payload = (await response.json()) as { attachment: AttachmentDto };
        setAttachments((previous) => [...previous, payload.attachment]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed.");
      } finally {
        setPending((previous) => previous.filter((item) => item.id !== uploadId));
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
    textareaRef.current?.focus();
  }

  // Window-level listeners so a drop anywhere in the chat pane attaches to this message.
  useEffect(() => {
    function onDragEnter(event: DragEvent) {
      if (!event.dataTransfer?.types.includes("Files")) return;
      dragDepth.current += 1;
      setDragging(true);
    }
    function onDragOver(event: DragEvent) {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    }
    function onDragLeave() {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    }
    function onDrop(event: DragEvent) {
      dragDepth.current = 0;
      setDragging(false);
      if (!event.dataTransfer?.files.length) return;
      event.preventDefault();
      void uploadFiles(event.dataTransfer.files);
    }

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  });

  const remaining = maxChars - value.length;

  return (
    <div className="relative border-t bg-background/85 px-3 py-3 backdrop-blur sm:px-6">
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-ring/60 bg-background/85 text-sm text-muted-foreground backdrop-blur-sm">
          Drop files to attach them to your next message
        </div>
      )}

      <div className="mx-auto w-full max-w-3xl">
        {(attachments.length > 0 || pending.length > 0) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <span
                key={attachment.id}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-muted/50 py-1 pr-1 pl-2 text-xs"
              >
                <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                <span className="max-w-[180px] truncate">{attachment.fileName}</span>
                <span className="text-muted-foreground">
                  {(attachment.sizeBytes / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setAttachments((previous) =>
                      previous.filter((item) => item.id !== attachment.id),
                    )
                  }
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label={`Remove ${attachment.fileName}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            {pending.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-2 py-1 text-xs text-muted-foreground"
              >
                <Loader2 className="size-3 animate-spin" />
                <span className="max-w-[180px] truncate">Uploading {item.fileName}</span>
              </span>
            ))}
          </div>
        )}

        <div
          className={cn(
            "relative flex items-end gap-1.5 rounded-2xl border bg-card p-1.5 shadow-sm transition-all focus-within:border-ring/60 focus-within:ring-3 focus-within:ring-ring/25 sm:gap-2 sm:p-2",
            overLimit && "border-destructive/60 focus-within:border-destructive focus-within:ring-destructive/25",
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => void uploadFiles(event.target.files)}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 rounded-xl text-muted-foreground"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || uploading || attachments.length >= MAX_ATTACHMENTS}
                aria-label="Attach a text file"
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              Attach a text file ({Math.round(maxUploadBytes / 1024 / 1024)} MB max · or drop it here)
            </TooltipContent>
          </Tooltip>

          <Textarea
            ref={textareaRef}
            data-composer
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={busy ? "Type your next message while this one finishes…" : "Message the assistant…"}
            aria-label="Message"
            enterKeyHint={sendOnEnter ? "send" : "enter"}
            className="max-h-56 min-h-[44px] flex-1 resize-none border-0 bg-transparent px-1 py-2.5 text-[15px] shadow-none focus-visible:ring-0"
          />

          {busy ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  onClick={onStop}
                  className="size-9 shrink-0 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 sm:size-10"
                  aria-label="Stop generating"
                >
                  <Square className="size-4 fill-current" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Stop generating (Esc)</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  onClick={handleSend}
                  disabled={!canSend}
                  className={cn("size-9 shrink-0 rounded-xl sm:size-10", !canSend && "opacity-40")}
                  aria-label="Send message"
                >
                  <Send className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {overLimit
                  ? "Shorten the message first"
                  : uploading
                    ? "Wait for the upload to finish"
                    : sendOnEnter
                      ? "Send (Enter)"
                      : "Send (⌘/Ctrl+Enter)"}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            {busy ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                Generating a reply · send unlocks when it finishes
              </>
            ) : (
              <>
                {sendOnEnter ? "Enter to send · Shift+Enter for a new line" : "⌘/Ctrl+Enter to send"}
                <span className="hidden sm:inline">
                  {" · "}
                  <kbd className="font-sans">/</kbd> to focus
                </span>
              </>
            )}
          </span>
          {overLimit ? (
            <span className="flex items-center gap-1 font-medium text-destructive">
              <AlertCircle className="size-3" />
              {(-remaining).toLocaleString()} characters over the limit
            </span>
          ) : remaining <= maxChars * 0.2 ? (
            <span className="tabular-nums">
              {value.length.toLocaleString()} / {maxChars.toLocaleString()}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
