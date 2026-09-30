import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { media } from "@/db/schema";
import { ensureSchema, logActivity } from "@/lib/core";
import { listMediaLite, MAX_MEDIA_BYTES, saveMedia } from "@/lib/media";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSchema();
  return NextResponse.json({ media: await listMediaLite() });
}

/** Загрузка фото в библиотеку (multipart/form-data: file + caption). */
export async function POST(req: NextRequest) {
  await ensureSchema();
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "bad form" }, { status: 400 });

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  const caption = String(form.get("caption") ?? "");
  if (!files.length) return NextResponse.json({ error: "нет файлов" }, { status: 400 });

  const saved = [];
  for (const file of files.slice(0, 20)) {
    if (!file.type.startsWith("image/")) continue;
    if (file.size > MAX_MEDIA_BYTES) continue;
    const buffer = await file.arrayBuffer();
    saved.push(
      await saveMedia({
        filename: file.name || "photo.jpg",
        mimeType: file.type,
        buffer,
        caption,
      }),
    );
  }

  if (!saved.length) {
    return NextResponse.json(
      { error: "файлы не приняты (только изображения до 6 МБ)" },
      { status: 400 },
    );
  }
  await logActivity("ФОТО ЗАГРУЖЕНЫ", `В библиотеку добавлено файлов: ${saved.length}.`);
  return NextResponse.json({ saved: saved.length, media: await listMediaLite() });
}

/** Обновление микро-ТЗ к фото. */
export async function PATCH(req: NextRequest) {
  await ensureSchema();
  const body = (await req.json().catch(() => ({}))) as { id?: number; caption?: string };
  if (!body.id) return NextResponse.json({ error: "no id" }, { status: 400 });
  await db
    .update(media)
    .set({ caption: String(body.caption ?? "").slice(0, 2000) })
    .where(eq(media.id, body.id));
  return NextResponse.json({ media: await listMediaLite() });
}

export async function DELETE(req: NextRequest) {
  await ensureSchema();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (Number.isFinite(id)) await db.delete(media).where(eq(media.id, id));
  return NextResponse.json({ media: await listMediaLite() });
}
