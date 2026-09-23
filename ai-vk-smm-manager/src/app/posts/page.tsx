import { desc } from "drizzle-orm";
import { db } from "@/db";
import { posts } from "@/db/schema";
import PostsClient from "@/components/pages/posts-client";
import { getSettings } from "@/lib/core";

export const dynamic = "force-dynamic";

export default async function PostsPage() {
  const [rows, s] = await Promise.all([
    db.select().from(posts).orderBy(desc(posts.id)).limit(100),
    getSettings(),
  ]);
  return <PostsClient initial={rows} tone={s.tone} groupId={s.groupId} />;
}
