import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { runTickIfDue } from "@/lib/actions";
import { getSettings, logActivity } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function POST() {
  const current = await getSettings();
  const updated = (
    await db
      .update(settings)
      .set({ active: !current.active, updatedAt: new Date() })
      .where(eq(settings.id, current.id))
      .returning()
  )[0];

  await logActivity(
    updated.active ? "БОТ АКТИВИРОВАН" : "БОТ ПРИОСТАНОВЛЕН",
    updated.active
      ? `Автопостинг включён. Расписание: ${updated.scheduleTimes}.`
      : "Автопостинг на паузе. Ручные публикации доступны.",
  );

  let tick: unknown = null;
  if (updated.active) {
    tick = await runTickIfDue();
  }

  return NextResponse.json({ settings: updated, tick });
}
