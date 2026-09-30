import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { competitors } from "@/db/schema";
import {
  listCompetitors,
  refreshAllCompetitors,
} from "@/lib/competitors";
import { ensureSchema, logActivity } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSchema();
  return NextResponse.json({ competitors: await listCompetitors() });
}

export async function POST(req: NextRequest) {
  await ensureSchema();
  const body = (await req.json().catch(() => ({}))) as { groupId?: string };
  const gid = (body.groupId ?? "").trim().replace(/^https?:\/\/(m\.)?vk\.com\//i, "");
  if (!gid) return NextResponse.json({ error: "empty" }, { status: 400 });
  const rows = await db.select().from(competitors);
  if (rows.length >= 5) {
    return NextResponse.json({ error: "Максимум 5 конкурентов" }, { status: 400 });
  }
  await db.insert(competitors).values({ groupId: gid, name: gid });
  await logActivity("КОНКУРЕНТ ДОБАВЛЕН", `Сообщество ${gid} взято на мониторинг.`, "info");
  await refreshAllCompetitors();
  return NextResponse.json({ competitors: await listCompetitors() });
}

export async function PUT() {
  await ensureSchema();
  const res = await refreshAllCompetitors();
  return NextResponse.json({ ...res, competitors: await listCompetitors() });
}

export async function DELETE(req: NextRequest) {
  await ensureSchema();
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (Number.isFinite(id)) await db.delete(competitors).where(eq(competitors.id, id));
  return NextResponse.json({ competitors: await listCompetitors() });
}
