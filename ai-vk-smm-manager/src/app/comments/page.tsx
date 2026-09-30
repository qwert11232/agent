import CommentsClient from "@/components/pages/comments-client";
import { listComments } from "@/lib/comments";
import { ensureSchema, getSettings } from "@/lib/core";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { isRealVkToken } from "@/lib/vk";

export const dynamic = "force-dynamic";

export default async function CommentsPage() {
  await ensureSchema();
  const [rows, s, leadRows] = await Promise.all([
    listComments(),
    getSettings(),
    db.select().from(leads).orderBy(desc(leads.id)).limit(100),
  ]);
  return (
    <CommentsClient
      initial={rows}
      autoReply={s.autoReply}
      autoModerate={s.autoModerate}
      faq={s.faq}
      live={isRealVkToken(s.vkToken) && Boolean(s.groupId)}
      leads={leadRows}
    />
  );
}
