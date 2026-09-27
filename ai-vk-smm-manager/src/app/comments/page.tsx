import CommentsClient from "@/components/pages/comments-client";
import { listComments } from "@/lib/comments";
import { ensureSchema, getSettings } from "@/lib/core";
import { isRealVkToken } from "@/lib/vk";

export const dynamic = "force-dynamic";

export default async function CommentsPage() {
  await ensureSchema();
  const [rows, s] = await Promise.all([listComments(), getSettings()]);
  return (
    <CommentsClient
      initial={rows}
      autoReply={s.autoReply}
      autoModerate={s.autoModerate}
      faq={s.faq}
      live={isRealVkToken(s.vkToken) && Boolean(s.groupId)}
    />
  );
}
