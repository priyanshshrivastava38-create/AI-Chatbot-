"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Loader2, MoreHorizontal, Pencil, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useConversationStore } from "./conversation-store";
import { useShell } from "@/components/shell-context";
import type { ConversationSummary } from "@/types/chat";

/** Minute-resolution clock. The server snapshot renders nothing, so no hydration mismatch. */
function subscribeMinute(onChange: () => void): () => void {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
}

function useMinute(): number {
  return useSyncExternalStore(
    subscribeMinute,
    () => Math.floor(Date.now() / 60_000),
    () => 0,
  );
}

function relativeTime(iso: string, now: number): string {
  if (now === 0) return "";
  const minutes = Math.max(0, now - Math.floor(new Date(iso).getTime() / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

export function ConversationItem({
  conversation,
  active,
}: {
  conversation: ConversationSummary;
  active: boolean;
}) {
  const store = useConversationStore();
  const shell = useShell();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [title, setTitle] = useState(conversation.title);
  const [saving, setSaving] = useState(false);

  async function submitRename() {
    const next = title.trim();
    if (!next || next === conversation.title) {
      setRenameOpen(false);
      return;
    }
    setSaving(true);
    await store.rename(conversation.id, next);
    setSaving(false);
    setRenameOpen(false);
  }

  const minute = useMinute();
  const updatedLabel = relativeTime(conversation.updatedAt, minute);

  return (
    <>
      <div
        className={cn(
          "group relative flex items-center rounded-lg transition-colors",
          active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
        )}
      >
        {active && (
          <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" aria-hidden />
        )}
        <Link
          href={`/chat/${conversation.id}`}
          onClick={shell.closeMobileSidebar}
          className="min-w-0 flex-1 truncate px-3 py-2 text-sm"
          title={conversation.title}
        >
          {conversation.title}
        </Link>

        <span
          className="shrink-0 pr-8 text-[11px] text-muted-foreground tabular-nums transition-opacity group-hover:opacity-0 max-md:pr-9"
          aria-hidden
        >
          {updatedLabel}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "absolute right-1 size-7 rounded-md text-muted-foreground opacity-100 transition-opacity hover:bg-transparent md:opacity-0 md:group-hover:opacity-100",
                active && "md:opacity-100",
              )}
              aria-label={`Options for ${conversation.title}`}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => setRenameOpen(true)}>
              <Pencil className="size-4" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href={`/api/conversations/${conversation.id}/export?format=markdown`}
                target="_blank"
                rel="noreferrer"
              >
                <Download className="size-4" /> Export
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
            <DialogDescription>Titles are used to find chats in the sidebar and search.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitRename();
            }}
            className="space-y-4"
          >
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              autoFocus
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || title.trim().length === 0}>
                {saving && <Loader2 className="size-4 animate-spin" />} Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete conversation?</DialogTitle>
            <DialogDescription>
              “{conversation.title}” and its {conversation.messageCount} message
              {conversation.messageCount === 1 ? "" : "s"} will be removed permanently.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteOpen(false);
                void store.remove(conversation.id);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
