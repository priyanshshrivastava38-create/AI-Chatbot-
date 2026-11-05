import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ConversationStoreProvider } from "@/components/sidebar/conversation-store";
import { Sidebar } from "@/components/sidebar/sidebar";
import { auth } from "@/lib/auth";
import { listConversations } from "@/lib/conversations";
import { toConversationDto } from "@/lib/dto";
import { buildModelsDto } from "@/lib/models-dto";
import { getPreferences } from "@/lib/preferences";

export const dynamic = "force-dynamic";

export default async function ChatLayout({ children }: LayoutProps<"/chat">) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login?callbackUrl=/chat");

  const [preferences, models, rows] = await Promise.all([
    getPreferences(userId),
    buildModelsDto(userId),
    listConversations(userId),
  ]);

  return (
    <ConversationStoreProvider initialConversations={rows.map(toConversationDto)}>
      <AppShell
        preferences={preferences}
        models={models}
        sidebar={<Sidebar name={session.user?.name ?? null} email={session.user?.email ?? ""} />}
      >
        {children}
      </AppShell>
    </ConversationStoreProvider>
  );
}
