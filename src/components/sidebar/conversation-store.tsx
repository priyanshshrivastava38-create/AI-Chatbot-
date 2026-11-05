"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ConversationSummary } from "@/types/chat";

type ConversationStoreValue = {
  conversations: ConversationSummary[];
  loading: boolean;
  query: string;
  setQuery: (value: string) => void;
  refresh: () => Promise<void>;
  create: () => Promise<string | null>;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActiveTitle: (id: string, title: string) => void;
};

const ConversationStoreContext = createContext<ConversationStoreValue | null>(null);

async function parseError(response: Response, fallback: string): Promise<string> {
  const detail = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return detail?.error?.message ?? `${fallback} (HTTP ${response.status}).`;
}

export function ConversationStoreProvider({
  initialConversations,
  children,
}: {
  initialConversations: ConversationSummary[];
  children: ReactNode;
}) {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const [conversations, setConversations] = useState(initialConversations);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const searchTimerRef = useRef<number | null>(null);

  const load = useCallback(async (search?: string) => {
    setLoading(true);
    try {
      const url = search?.trim()
        ? `/api/conversations?q=${encodeURIComponent(search.trim())}`
        : "/api/conversations";
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(await parseError(response, "Could not load conversations"));
      const payload = (await response.json()) as { conversations: ConversationSummary[] };
      setConversations(payload.conversations);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load conversations.");
    } finally {
      setLoading(false);
    }
  }, []);

  // A fresh server payload (first render or router.refresh) replaces the local list.
  const [syncedInitial, setSyncedInitial] = useState(initialConversations);
  if (syncedInitial !== initialConversations) {
    setSyncedInitial(initialConversations);
    setConversations(initialConversations);
  }

  const refresh = useCallback(async () => {
    await load(query);
  }, [load, query]);

  // Debounced server-side search so message content matches too, not just titles.
  useEffect(() => {
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(() => {
      void load(query);
    }, query.length > 0 ? 250 : 0);
    return () => {
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    };
  }, [load, query]);

  const create = useCallback(async () => {
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error(await parseError(response, "Could not start a new chat"));
      const payload = (await response.json()) as { conversation: ConversationSummary };
      setConversations((previous) => [payload.conversation, ...previous]);
      router.push(`/chat/${payload.conversation.id}`);
      return payload.conversation.id;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start a new chat.");
      return null;
    }
  }, [router]);

  const rename = useCallback(
    async (id: string, title: string) => {
      try {
        const response = await fetch(`/api/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!response.ok) throw new Error(await parseError(response, "Could not rename the chat"));
        setConversations((previous) =>
          previous.map((conversation) => (conversation.id === id ? { ...conversation, title } : conversation)),
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not rename the chat.");
      }
    },
    [],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
        if (!response.ok) throw new Error(await parseError(response, "Could not delete the chat"));
        const remaining = conversations.filter((conversation) => conversation.id !== id);
        setConversations(remaining);
        if (params?.id === id) {
          if (remaining[0]) router.push(`/chat/${remaining[0].id}`);
          else void create();
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not delete the chat.");
      }
    },
    [conversations, create, params, router],
  );

  const setActiveTitle = useCallback((id: string, title: string) => {
    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.id === id ? { ...conversation, title, updatedAt: new Date().toISOString() } : conversation,
      ),
    );
  }, []);

  const value = useMemo<ConversationStoreValue>(
    () => ({
      conversations,
      loading,
      query,
      setQuery,
      refresh,
      create,
      rename,
      remove,
      setActiveTitle,
    }),
    [conversations, create, loading, query, refresh, remove, rename, setActiveTitle],
  );

  return (
    <ConversationStoreContext.Provider value={value}>{children}</ConversationStoreContext.Provider>
  );
}

export function useConversationStore(): ConversationStoreValue {
  const context = useContext(ConversationStoreContext);
  if (!context) {
    throw new Error("useConversationStore must be used inside ConversationStoreProvider");
  }
  return context;
}
