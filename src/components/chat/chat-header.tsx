"use client";

import { useEffect, useRef, useState } from "react";
import {
  Braces,
  Check,
  ChevronDown,
  Download,
  FileText,
  Loader2,
  MessageSquarePlus,
  Pencil,
  PanelLeft,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useShell } from "@/components/shell-context";
import { cn } from "@/lib/utils";

type ChatHeaderProps = {
  conversationId: string;
  title: string;
  models: string[];
  model: string;
  isGenerating: boolean;
  onModelChange: (model: string) => void;
  onRename: (title: string) => void;
};

function IconButton({
  label,
  side = "bottom",
  ...props
}: React.ComponentProps<typeof Button> & { label: string; side?: "bottom" | "left" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" {...props} />
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ChatHeader({
  conversationId,
  title,
  models,
  model,
  isGenerating,
  onModelChange,
  onRename,
}: ChatHeaderProps) {
  const shell = useShell();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.select());
    return () => window.cancelAnimationFrame(frame);
  }, [editing]);

  // A rename from the stream or the sidebar replaces the draft unless it is being edited.
  const [syncedTitle, setSyncedTitle] = useState(title);
  if (syncedTitle !== title) {
    setSyncedTitle(title);
    if (!editing) setDraft(title);
  }

  function commitRename() {
    const next = draft.trim().slice(0, 120);
    setEditing(false);
    if (next && next !== title) onRename(next);
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b bg-background/85 px-2 backdrop-blur sm:gap-2 sm:px-3">
      <IconButton
        label="Conversations"
        className="md:hidden"
        onClick={shell.openMobileSidebar}
        aria-label="Open conversations"
      >
        <PanelLeft className="size-4" />
      </IconButton>
      <IconButton
        label={shell.sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        className="hidden md:inline-flex"
        onClick={shell.toggleSidebar}
        aria-label="Toggle sidebar"
      >
        <PanelLeft className="size-4" />
      </IconButton>

      {editing ? (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitRename();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setDraft(title);
                setEditing(false);
              }
            }}
            onBlur={commitRename}
            maxLength={120}
            aria-label="Conversation name"
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onMouseDown={(event) => event.preventDefault()}
            onClick={commitRename}
            aria-label="Save name"
          >
            <Check className="size-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Click to rename this conversation"
          className="group flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="truncate text-sm font-medium">{title}</span>
          <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-60" />
        </button>
      )}

      {isGenerating && (
        <span className="hidden items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground sm:inline-flex">
          <Loader2 className="size-3 animate-spin" />
          Generating
        </span>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Choose the model for this conversation"
          >
            <span className="max-w-[10ch] truncate font-mono text-xs sm:max-w-[16ch]">{model}</span>
            <ChevronDown className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-1">
          <p className="px-2 py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Model for this chat
          </p>
          <div className="max-h-64 overflow-y-auto">
            {models.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onModelChange(option)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  option === model && "bg-accent/60 text-foreground",
                )}
              >
                <Check
                  className={cn("size-3.5 shrink-0", option === model ? "opacity-100" : "opacity-0")}
                />
                <span className="truncate font-mono text-xs">{option}</span>
              </button>
            ))}
          </div>
          <p className="px-2 pt-1.5 pb-1 text-[11px] text-muted-foreground">
            Change the default for new chats in Settings.
          </p>
        </PopoverContent>
      </Popover>

      <IconButton
        label="New chat (⌘K)"
        onClick={() => void shell.newChat()}
        aria-label="Start a new chat"
      >
        <MessageSquarePlus className="size-4" />
      </IconButton>

      <IconButton label="Settings" onClick={shell.openSettings} aria-label="Open settings">
        <Settings2 className="size-4" />
      </IconButton>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            aria-label="Export conversation"
          >
            <Download className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Export this chat</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <a
              href={`/api/conversations/${conversationId}/export?format=markdown`}
              target="_blank"
              rel="noreferrer"
            >
              <FileText className="size-4" />
              Markdown (.md)
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href={`/api/conversations/${conversationId}/export?format=json`}
              target="_blank"
              rel="noreferrer"
            >
              <Braces className="size-4" />
              JSON (.json)
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <p className="px-2 py-1 text-[11px] text-muted-foreground">
            Downloads include every message and its metadata.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
