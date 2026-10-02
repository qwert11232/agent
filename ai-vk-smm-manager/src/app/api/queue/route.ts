import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/core";
import { listScheduled, resetQueueFlags, syncVkQueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSchema();
  return NextResponse.json({ scheduled: await listScheduled() });
}

/** Синхронизация очереди: дописать недостающие отложенные посты в VK. */
export async function POST() {
  await ensureSchema();
  const result = await syncVkQueue();
  return NextResponse.json({ ...result, scheduled: await listScheduled() });
}

/** Сброс локальных пометок (если очередь в VK очищена вручную). */
export async function DELETE() {
  await ensureSchema();
  await resetQueueFlags();
  return NextResponse.json({ ok: true, scheduled: await listScheduled() });
}
