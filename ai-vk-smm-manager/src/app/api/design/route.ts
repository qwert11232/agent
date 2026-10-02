import { NextRequest, NextResponse } from "next/server";
import { FONTS, FORMATS, LAYOUTS, PRESETS, normalizeDesign, DEFAULT_DESIGN } from "@/lib/design";
import { ensureSchema } from "@/lib/core";
import { deletePreset, getDefaultDesign, listSavedPresets, savePreset, saveDefaultDesign } from "@/lib/design-store";
import { fontStatus } from "@/lib/fonts";

export const dynamic = "force-dynamic";

/** Всё для редактора дизайна: текущий дефолт, встроенные и сохранённые пресеты, статус шрифтов. */
export async function GET() {
  await ensureSchema();
  const [def, saved] = await Promise.all([getDefaultDesign(), listSavedPresets()]);
  return NextResponse.json({
    default: def,
    builtin: PRESETS.map((p) => ({ id: p.id, name: p.name, design: normalizeDesign(p.design, DEFAULT_DESIGN) })),
    saved,
    fonts: FONTS,
    layouts: LAYOUTS,
    formats: FORMATS,
    fontStatus: fontStatus(),
  });
}

export async function POST(req: NextRequest) {
  await ensureSchema();
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    design?: unknown;
    name?: string;
    id?: number;
  };
  try {
    if (body.action === "saveDefault") {
      return NextResponse.json({ ok: true, design: await saveDefaultDesign(body.design) });
    }
    if (body.action === "savePreset") {
      return NextResponse.json({ ok: true, preset: await savePreset(String(body.name ?? ""), body.design) });
    }
    if (body.action === "deletePreset") {
      await deletePreset(Number(body.id));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}
