import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts, settings } from "@/db/schema";
import { listPostImageIds } from "@/lib/carousel";
import { ensureSchema, getSettings, logActivity } from "@/lib/core";
import { generateDigest, previewNews } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  await ensureSchema();
  if (req.nextUrl.searchParams.get("news") === "1") {
    return NextResponse.json(await previewNews());
  }
  const s = await getSettings();
  const rows = await db.select().from(posts).where(eq(posts.kind, "digest")).orderBy(desc(posts.id)).limit(10);
  const imgs = await listPostImageIds(rows.map((r) => r.id));
  return NextResponse.json({
    settings: {
      digestEnabled: s.digestEnabled,
      digestTime: s.digestTime,
      digestCarousel: s.digestCarousel,
      digestPhotos: s.digestPhotos,
      digestNiche: s.digestNiche,
      active: s.active,
    },
    digests: rows.map((r) => ({ ...r, slideIds: imgs.get(r.id) ?? [] })),
  });
}

export async function POST(req: NextRequest) {
  await ensureSchema();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.action === "settings") {
    const cur = await getSettings();
    const time = String(body.digestTime ?? cur.digestTime).trim();
    const m = /^(\d{1,2}):(\d{2})$/.exec(time);
    const t = m ? `${String(Math.min(23, Number(m[1]))).padStart(2, "0")}:${String(Math.min(59, Number(m[2]))).padStart(2, "0")}` : cur.digestTime;
    await db
      .update(settings)
      .set({
        digestEnabled: body.digestEnabled === undefined ? cur.digestEnabled : Boolean(body.digestEnabled),
        digestTime: t,
        digestCarousel: body.digestCarousel === undefined ? cur.digestCarousel : Boolean(body.digestCarousel),
        digestPhotos: body.digestPhotos === undefined ? cur.digestPhotos : Boolean(body.digestPhotos),
        digestNiche: String(body.digestNiche ?? cur.digestNiche).slice(0, 300),
        updatedAt: new Date(),
      })
      .where(eq(settings.id, cur.id));
    await logActivity("ДАЙДЖЕСТ: НАСТРОЙКИ", `Ежедневный дайджест ${body.digestEnabled ? "включён" : "выключен"}, время ${t}.`, "info");
    return NextResponse.json({ ok: true });
  }

  try {
    const out = await generateDigest({
      carousel: body.carousel === undefined ? undefined : Boolean(body.carousel),
      photos: body.photos === undefined ? undefined : Boolean(body.photos),
      theme: typeof body.theme === "string" ? body.theme : undefined,
    });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Не удалось собрать дайджест" },
      { status: 500 },
    );
  }
}
