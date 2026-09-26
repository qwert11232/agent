import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { media, type MediaRow } from "@/db/schema";

export const MAX_MEDIA_BYTES = 6 * 1024 * 1024; // 6 МБ на файл

export async function listMedia(): Promise<MediaRow[]> {
  return db.select().from(media).orderBy(desc(media.id)).limit(200);
}

/** Список без тяжёлого base64 — для страниц и API. */
export async function listMediaLite() {
  return db
    .select({
      id: media.id,
      filename: media.filename,
      mimeType: media.mimeType,
      caption: media.caption,
      usedCount: media.usedCount,
      lastUsedAt: media.lastUsedAt,
      createdAt: media.createdAt,
      bytes: sql<number>`length(${media.data})`,
    })
    .from(media)
    .orderBy(desc(media.id))
    .limit(200);
}

export type MediaLite = Awaited<ReturnType<typeof listMediaLite>>[number];

export async function getMedia(id: number) {
  return (await db.select().from(media).where(eq(media.id, id)))[0] ?? null;
}

export async function saveMedia(opts: {
  filename: string;
  mimeType: string;
  buffer: ArrayBuffer;
  caption: string;
}) {
  const data = Buffer.from(opts.buffer).toString("base64");
  return (
    await db
      .insert(media)
      .values({
        filename: opts.filename.slice(0, 200),
        mimeType: opts.mimeType,
        data,
        caption: opts.caption.slice(0, 2000),
      })
      .returning({
        id: media.id,
        filename: media.filename,
        caption: media.caption,
      })
  )[0];
}

/**
 * Следующее фото для автопоста: сначала ни разу не использованные,
 * затем — самое давно использованное (ротация по кругу).
 */
export async function pickNextMedia(): Promise<MediaRow | null> {
  const fresh = (
    await db
      .select()
      .from(media)
      .where(eq(media.usedCount, 0))
      .orderBy(asc(media.id))
      .limit(1)
  )[0];
  if (fresh) return fresh;
  return (
    (
      await db
        .select()
        .from(media)
        .orderBy(asc(sql`coalesce(${media.lastUsedAt}, ${media.createdAt})`))
        .limit(1)
    )[0] ?? null
  );
}

export async function markMediaUsed(id: number) {
  await db
    .update(media)
    .set({ usedCount: sql`${media.usedCount} + 1`, lastUsedAt: new Date() })
    .where(eq(media.id, id));
}

export function mediaBuffer(row: MediaRow): ArrayBuffer {
  const buf = Buffer.from(row.data, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
