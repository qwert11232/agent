import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { postImages, posts, slideSpecs } from "@/db/schema";
import { getSettings, logActivity } from "@/lib/core";
import { reviewNoteFor } from "@/lib/actions";
import { sanitizePostText } from "@/lib/style";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  await db.delete(postImages).where(eq(postImages.postId, numId));
  await db.delete(slideSpecs).where(eq(slideSpecs.postId, numId));
  await db.delete(posts).where(eq(posts.id, numId));
  await logActivity("ПОСТ УДАЛЁН", `Запись #${numId} удалена из базы.`, "info");
  return NextResponse.json({ ok: true });
}

/**
 * Ручная проверка: {approve: true} снимает пометку «нужна проверка» (владелец подтвердил числа и текст),
 * {text} сохраняет правку и заново проверяет текст на числа без опоры.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { approve?: boolean; text?: string };
  const row = (await db.select().from(posts).where(eq(posts.id, numId)))[0];
  if (!row) return NextResponse.json({ error: "Пост не найден" }, { status: 404 });
  if (row.status === "published") return NextResponse.json({ error: "Опубликованный пост менять нельзя" }, { status: 409 });

  const patch: Partial<typeof posts.$inferInsert> = {};
  if (typeof body.text === "string" && body.text.trim()) {
    const text = sanitizePostText(body.text);
    patch.text = text;
    patch.reviewNote = reviewNoteFor(text, (await getSettings()).factsBank);
  }
  if (body.approve) patch.reviewNote = "";
  if (!Object.keys(patch).length) return NextResponse.json({ error: "нечего менять" }, { status: 400 });
  const post = (await db.update(posts).set(patch).where(eq(posts.id, numId)).returning())[0];
  await logActivity("ПОСТ ПРОВЕРЕН", `Черновик #${numId}: ${body.approve ? "подтверждён владельцем" : "текст отредактирован"}.`, "info");
  return NextResponse.json({ post });
}
