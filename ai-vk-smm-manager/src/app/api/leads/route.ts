import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { ensureSchema } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSchema();
  const rows = await db.select().from(leads).orderBy(desc(leads.id)).limit(100);
  return NextResponse.json({ leads: rows });
}

/** Смена статуса лида: contacted / closed. */
export async function PATCH(req: NextRequest) {
  await ensureSchema();
  const body = (await req.json().catch(() => ({}))) as { id?: number; status?: string };
  if (!body.id) return NextResponse.json({ error: "no id" }, { status: 400 });
  const status = ["new", "contacted", "closed"].includes(String(body.status))
    ? String(body.status)
    : "new";
  await db.update(leads).set({ status }).where(eq(leads.id, body.id));
  const rows = await db.select().from(leads).orderBy(desc(leads.id)).limit(100);
  return NextResponse.json({ leads: rows });
}
