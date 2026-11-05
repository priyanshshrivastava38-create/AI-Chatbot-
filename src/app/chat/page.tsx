import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createConversation, listConversations } from "@/lib/conversations";

export const dynamic = "force-dynamic";

export default async function ChatIndexPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login?callbackUrl=/chat");

  const [recent] = await listConversations(userId, { limit: 1 });
  if (recent) redirect(`/chat/${recent.id}`);

  const conversation = await createConversation(userId);
  redirect(`/chat/${conversation.id}`);
}
