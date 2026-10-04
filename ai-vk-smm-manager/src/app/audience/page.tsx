import { MessageCircleMore, MessagesSquare } from "lucide-react";
import { HubBar } from "@/components/hub";
import { ChatTab, CommentsTab } from "@/components/server-tabs";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "comments", label: "Комментарии и клиенты", icon: MessageCircleMore },
  { id: "chat", label: "Чат с ботом", icon: MessagesSquare },
];

export default async function AudiencePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return (
    <>
      <HubBar base="/audience" active={tab ?? "comments"} tabs={TABS} />
      {tab === "chat" ? <ChatTab /> : <CommentsTab />}
    </>
  );
}
