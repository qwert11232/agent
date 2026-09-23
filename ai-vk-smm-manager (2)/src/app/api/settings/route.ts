import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { getSettings, logActivity } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSettings();
  return NextResponse.json({ settings: s });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const current = await getSettings();

  const times = String(body.scheduleTimes ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
    .map((t) => {
      const [h, m] = t.split(":").map(Number);
      return `${String(Math.min(23, h)).padStart(2, "0")}:${String(Math.min(59, m)).padStart(2, "0")}`;
    });

  const tone = ["friendly", "business", "funny"].includes(String(body.tone))
    ? String(body.tone)
    : "friendly";

  const updated = (
    await db
      .update(settings)
      .set({
        vkToken: String(body.vkToken ?? ""),
        gptKey: String(body.gptKey ?? ""),
        groupId: String(body.groupId ?? "").replace(/[^0-9]/g, ""),
        instruction: String(body.instruction ?? ""),
        scheduleTimes: times.length ? times.join(",") : current.scheduleTimes,
        tone,
        updatedAt: new Date(),
      })
      .where(eq(settings.id, current.id))
      .returning()
  )[0];

  await logActivity(
    "НАСТРОЙКИ СОХРАНЕНЫ",
    `Тон: ${updated.tone}; расписание: ${updated.scheduleTimes}; группа: ${updated.groupId || "—"}.`,
  );
  return NextResponse.json({ settings: updated });
}
