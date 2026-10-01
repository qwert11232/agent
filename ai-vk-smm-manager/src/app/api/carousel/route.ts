import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { generateCarousel, listPostImageIds } from "@/lib/carousel";
import { ensureSchema } from "@/lib/core";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  await ensureSchema();
  const rows = await db.select().from(posts).where(eq(posts.kind, "carousel")).orderBy(desc(posts.id)).limit(10);
  const imgs = await listPostImageIds(rows.map((r) => r.id));
  return NextResponse.json({ items: rows.map((r) => ({ ...r, slideIds: imgs.get(r.id) ?? [] })) });
}

export async function POST(req: NextRequest) {
  await ensureSchema();
  const body = (await req.json().catch(() => ({}))) as {
    topic?: string;
    slides?: number;
    theme?: string;
    photos?: boolean;
  };
  try {
    const out = await generateCarousel({
      topic: body.topic ?? "",
      slides: body.slides,
      theme: body.theme,
      photos: Boolean(body.photos),
    });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Не удалось создать карусель" },
      { status: 500 },
    );
  }
}
