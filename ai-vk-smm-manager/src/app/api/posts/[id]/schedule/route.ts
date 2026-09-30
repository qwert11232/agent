import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { getMedia, mediaBuffer } from "@/lib/media";
import { ensureSchema, getSettings, logActivity } from "@/lib/core";
import { isRealVkToken, vkPublishPost } from "@/lib/vk";

export const dynamic = "force-dynamic";

/**
 * Ручное планирование поста (Режим Б из ТЗ):
 * - С VK-токеном → уходит в VK как отложенный (публикует сам VK).
 * - Без токена → остаётся локальным scheduled, тик опубликует когда время придёт.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  await ensureSchema();
  const { id } = await ctx.params;
  const numId = Number(id);
  const body = (await req.json().catch(() => ({}))) as { at?: string };
  const at = body.at ? new Date(body.at) : null;
  if (!Number.isFinite(numId) || !at || Number.isNaN(at.getTime())) {
    return NextResponse.json({ error: "bad id or datetime" }, { status: 400 });
  }
  const minFuture = Date.now() + 55_000;
  if (at.getTime() < minFuture) {
    return NextResponse.json(
      { error: "Время уже прошло — выберите момент в будущем" },
      { status: 400 },
    );
  }

  const post = (await db.select().from(posts).where(eq(posts.id, numId)))[0];
  if (!post) return NextResponse.json({ error: "Пост не найден" }, { status: 404 });
  if (post.status === "published") {
    return NextResponse.json({ error: "Уже опубликован" }, { status: 400 });
  }

  const s = await getSettings();
  const live = isRealVkToken(s.vkToken) && Boolean(s.groupId);

  if (live) {
    let imageBytes: ArrayBuffer | null = null;
    let imageMime: string | undefined;
    if (post.mediaId) {
      const row = await getMedia(post.mediaId);
      if (row) {
        imageBytes = mediaBuffer(row);
        imageMime = row.mimeType;
      }
    }
    const res = await vkPublishPost({
      token: s.vkToken,
      groupId: s.groupId,
      text: post.text,
      imageUrl: imageBytes ? null : post.imageUrl,
      imageBytes,
      imageMime,
      publishAt: Math.floor(at.getTime() / 1000),
    });
    if (!res.ok || !res.postId) {
      return NextResponse.json(
        { error: res.error ?? "VK отклонил отложенный пост" },
        { status: 502 },
      );
    }
    const updated = (
      await db
        .update(posts)
        .set({ status: "scheduled", vkPostId: res.postId, scheduledAt: at })
        .where(eq(posts.id, numId))
        .returning()
    )[0];
    await logActivity(
      "ПОСТ ЗАПЛАНИРОВАН В VK",
      `Пост #${numId} стоит в отложенных ВКонтакте на ${at.toLocaleString("ru-RU", { timeZone: process.env.SCHEDULE_TZ || undefined })}.`,
    );
    return NextResponse.json({ post: updated, mode: "vk" });
  }

  const updated = (
    await db
      .update(posts)
      .set({ status: "scheduled", scheduledAt: at })
      .where(eq(posts.id, numId))
      .returning()
  )[0];
  await logActivity(
    "ПОСТ ЗАПЛАНИРОВАН ЛОКАЛЬНО",
    `Пост #${numId} выйдет ${at.toLocaleString("ru-RU", { timeZone: process.env.SCHEDULE_TZ || undefined })} (локальная очередь — без VK-токена).`,
    "info",
  );
  return NextResponse.json({ post: updated, mode: "local" });
}
