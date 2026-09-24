import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { ensureSchema } from "@/lib/core";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSchema();
  const rows = await db
    .select()
    .from(activityLog)
    .orderBy(desc(activityLog.id))
    .limit(100);
  return NextResponse.json({ activity: rows });
}
