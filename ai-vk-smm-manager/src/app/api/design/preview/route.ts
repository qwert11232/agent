import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/core";
import { normalizeDesign } from "@/lib/design";
import { resolveLogo } from "@/lib/design-store";
import { renderSlidePng, type SlideSpec } from "@/lib/slides";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Sample = { title?: string; body?: string; label?: string };

const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * Живое превью: рисует обложку, обычный слайд и финал выбранным дизайном.
 * Возвращает PNG в виде data URI (без записи в БД).
 */
export async function POST(req: NextRequest) {
  await ensureSchema();
  const body = (await req.json().catch(() => ({}))) as { design?: unknown; sample?: Sample };
  const design = normalizeDesign(body.design);
  const sample = body.sample ?? {};
  const title = clip(sample.title, 70) || "5 ошибок лендинга, которые сливают бюджет";
  const text = clip(sample.body, 220) || "Заголовок не про вас, форма на пять полей и ни одного отзыва — вот что режет конверсию.";
  const label = clip(sample.label, 40) || "Карусель";
  const specs: SlideSpec[] = [
    { kind: "cover", title, body: "Разбираем на реальных примерах", label },
    { kind: "point", title: "Заголовок говорит про клиента", body: text, label },
    { kind: "outro", title: "Сохраните, чтобы не потерять", body: "Есть вопросы по проекту — пишите в сообщения группы.", label },
  ];
  try {
    const logo = await resolveLogo(design);
    const images: string[] = [];
    for (let i = 0; i < specs.length; i++) {
      const png = await renderSlidePng(specs[i], i + 1, specs.length, design, { logo });
      images.push(`data:image/png;base64,${Buffer.from(png).toString("base64")}`);
    }
    return NextResponse.json({ images, format: design.format });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось отрисовать превью" }, { status: 500 });
  }
}
