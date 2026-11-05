import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChatView } from "@/components/chat/chat-view";
import { auth } from "@/lib/auth";
import { findOwnedConversation, getConversationMessages } from "@/lib/conversations";
import { toMessageDto } from "@/lib/dto";
import { buildModelsDto } from "@/lib/models-dto";
import { getPreferences } from "@/lib/preferences";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return { title: "Chat" };
  try {
    const conversation = await findOwnedConversation(session.user.id, id);
    return { title: conversation.title };
  } catch {
    return { title: "Chat" };
  }
}

export default async function ConversationPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login?callbackUrl=/chat");

  let conversation;
  try {
    conversation = await findOwnedConversation(userId, id);
  } catch {
    notFound();
  }

  const [messages, preferences, models] = await Promise.all([
    getConversationMessages(userId, conversation.id),
    getPreferences(userId),
    buildModelsDto(userId),
  ]);

  return (
    <ChatView
      conversation={{ id: conversation.id, title: conversation.title, model: conversation.model }}
      initialMessages={messages.map(toMessageDto)}
      preferences={preferences}
      models={models}
    />
  );
}
