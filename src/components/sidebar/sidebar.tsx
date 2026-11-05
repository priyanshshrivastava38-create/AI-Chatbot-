"use client";

import { useParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import {
  Loader2,
  LogOut,
  MessageSquarePlus,
  Moon,
  Search,
  Settings2,
  SquareTerminal,
  Sun,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConversationSummary } from "@/types/chat";
import { ConversationItem } from "./conversation-item";
import { useShell } from "@/components/shell-context";
import { useClientRendered } from "@/lib/use-client-rendered";
import { useConversationStore } from "./conversation-store";

function startOfDay(date: Date): number {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

function groupConversations(conversations: ConversationSummary[]) {
  const today = startOfDay(new Date());
  const buckets: Record<string, ConversationSummary[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    "Previous 30 days": [],
    Older: [],
  };

  for (const conversation of conversations) {
    const days = Math.floor((today - startOfDay(new Date(conversation.updatedAt))) / 86_400_000);
    if (days <= 0) buckets.Today.push(conversation);
    else if (days === 1) buckets.Yesterday.push(conversation);
    else if (days <= 7) buckets["Previous 7 days"].push(conversation);
    else if (days <= 30) buckets["Previous 30 days"].push(conversation);
    else buckets.Older.push(conversation);
  }

  return Object.entries(buckets).filter(([, items]) => items.length > 0);
}

export function Sidebar({ name, email }: { name: string | null; email: string }) {
  const store = useConversationStore();
  const shell = useShell();
  const params = useParams<{ id?: string }>();
  const { resolvedTheme, setTheme } = useTheme();

  const initials = (name ?? email).trim().slice(0, 2).toUpperCase();
  const groups = groupConversations(store.conversations);
  const mounted = useClientRendered();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <SquareTerminal className="size-4" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">Prism</p>
          <p className="text-[11px] text-muted-foreground">Real-time AI chat</p>
        </div>
      </div>

      <div className="px-3 pt-2">
        <Button
          onClick={() => void store.create()}
          className="w-full justify-start gap-2"
          variant="secondary"
        >
          <MessageSquarePlus className="size-4" />
          New chat
          <kbd className="ml-auto hidden rounded border bg-background px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground sm:inline-block">
            ⌘K
          </kbd>
        </Button>
      </div>

      <div className="relative px-3 py-3">
        <Search className="pointer-events-none absolute left-6 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={store.query}
          onChange={(event) => store.setQuery(event.target.value)}
          placeholder="Search titles and messages"
          className="h-9 pl-8 pr-8 text-sm"
          aria-label="Search conversations"
        />
        {store.query ? (
          <button
            type="button"
            onClick={() => store.setQuery("")}
            className="absolute right-6 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Clear search"
          >
            {store.loading ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        {store.query && !store.loading && (
          <p className="px-2 pb-2 text-[11px] text-muted-foreground">
            {store.conversations.length} match{store.conversations.length === 1 ? "" : "es"} for
            “{store.query}”
          </p>
        )}
        {store.loading && store.conversations.length === 0 ? (
          <div className="space-y-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        ) : store.conversations.length === 0 ? (
          <div className="px-2 py-8 text-center text-xs text-muted-foreground">
            {store.query ? (
              <>
                <p className="font-medium">Nothing matched “{store.query}”.</p>
                <button
                  type="button"
                  onClick={() => store.setQuery("")}
                  className="mt-2 rounded-md border px-2 py-1 transition-colors hover:bg-accent hover:text-foreground"
                >
                  Clear search
                </button>
              </>
            ) : (
              <>
                <p className="font-medium">No conversations yet.</p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => void store.create()}
                >
                  <MessageSquarePlus className="size-4" />
                  Start your first chat
                </Button>
                <p className="mt-2">Or press <kbd className="font-sans">⌘K</kbd> anywhere.</p>
              </>
            )}
          </div>
        ) : (
          groups.map(([label, items]) => (
            <div key={label} className="mb-3">
              <p className="px-2 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {mounted ? label : ""}
              </p>
              <div className="space-y-0.5">
                {items.map((conversation) => (
                  <ConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === params?.id}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-accent"
            >
              <Avatar className="size-7">
                <AvatarFallback className="text-[11px]">{initials}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{name ?? "Your account"}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{email}</span>
              </span>
              <Settings2 className="size-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={shell.openSettings}>
              <Settings2 className="size-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            >
              {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {resolvedTheme === "dark" ? "Light theme" : "Dark theme"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => void signOut({ callbackUrl: "/login" })}>
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
