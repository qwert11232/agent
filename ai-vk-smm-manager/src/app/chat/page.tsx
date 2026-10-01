import { asc } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages } from "@/db/schema";
import ChatClient from "@/components/pages/chat-client";
import { ensureSchema, getSettings } from "@/lib/core";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  await ensureSchema();
  const [messages, s] = await Promise.all([
    db.select().from(chatMessages).orderBy(asc(chatMessages.id)).limit(100),
    getSettings(),
  ]);
  return <ChatClient initial={messages} groupId={s.groupId} />;
}
