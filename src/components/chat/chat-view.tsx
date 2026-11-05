"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { WelcomeScreen } from "./welcome-screen";
import { useChat } from "@/hooks/use-chat";
import { useConversationStore } from "@/components/sidebar/conversation-store";
import type { AttachmentDto, Message, ModelsDto, PreferencesDto } from "@/types/chat";

type ChatViewProps = {
  conversation: { id: string; title: string; model: string | null };
  initialMessages: Message[];
  preferences: PreferencesDto;
  models: ModelsDto;
};

export function ChatView({ conversation, initialMessages, preferences, models }: ChatViewProps) {
  const store = useConversationStore();
  const [title, setTitle] = useState(conversation.title);
  const [model, setModel] = useState(conversation.model ?? preferences.model);
  const [draft, setDraft] = useState("");

  const chat = useChat({
    conversationId: conversation.id,
    initialMessages,
    params: {
      model,
      temperature: preferences.temperature,
      maxOutputTokens: preferences.maxOutputTokens,
    },
    onTitle: useCallback(
      (next: string) => {
        setTitle(next);
        store.setActiveTitle(conversation.id, next);
      },
      [conversation.id, store],
    ),
    onStreamEnd: useCallback(() => {
      void store.refresh();
    }, [store]),
  });

  const retryTurn = chat.retry;

  // Opening another conversation drops the draft; a rename or model change only refreshes the header.
  const [syncedId, setSyncedId] = useState(conversation.id);
  if (syncedId !== conversation.id) {
    setSyncedId(conversation.id);
    setDraft("");
  }

  const headerKey = `${conversation.title}\u0000${conversation.model ?? ""}\u0000${preferences.model}`;
  const [syncedHeaderKey, setSyncedHeaderKey] = useState(headerKey);
  if (syncedHeaderKey !== headerKey) {
    setSyncedHeaderKey(headerKey);
    setTitle(conversation.title);
    setModel(conversation.model ?? preferences.model);
  }

  useEffect(() => {
    if (!chat.error) return;
    toast.error(chat.error, {
      action: { label: "Try again", onClick: () => void retryTurn() },
    });
  }, [chat.error, retryTurn]);

  // The tab title comes from the stored conversation, so keep it in step with renames and
  // with the label generated after the first reply.
  useEffect(() => {
    document.title = `${title} · Prism`;
  }, [title]);

  const handleSend = useCallback(
    (content: string, attachments: AttachmentDto[]) => {
      void chat.send(content, attachments);
    },
    [chat],
  );

  async function handleModelChange(next: string) {
    setModel(next);
    try {
      const response = await fetch(`/api/conversations/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: next }),
      });
      if (!response.ok) toast.error("Could not save the model choice for this chat.");
    } catch {
      toast.error("Could not save the model choice for this chat.");
    }
  }

  return (
    <>
      <ChatHeader
        conversationId={conversation.id}
        title={title}
        models={models.models}
        model={model}
        isGenerating={chat.isBusy}
        onModelChange={(value) => void handleModelChange(value)}
        onRename={(next) => {
          setTitle(next);
          void store.rename(conversation.id, next);
        }}
      />

      {chat.messages.length === 0 ? (
        <WelcomeScreen
          modelName={model}
          onPick={(prompt) => {
            void chat.send(prompt, []);
          }}
        />
      ) : (
        <MessageList
          messages={chat.messages}
          isStreaming={chat.phase === "streaming" || chat.phase === "submitting"}
          onRegenerate={() => void chat.regenerate()}
          onRetry={() => void chat.retry()}
          onSelectFollowUp={(question) => void chat.send(question, [])}
        />
      )}

      <Composer
        conversationId={conversation.id}
        value={draft}
        onValueChange={setDraft}
        onSubmit={handleSend}
        onStop={() => void chat.stop()}
        busy={chat.isBusy}
        sendOnEnter={preferences.sendOnEnter}
        maxChars={models.limits.maxInputChars}
        maxUploadBytes={models.limits.maxUploadBytes}
      />
    </>
  );
}
