import LibraryClient from "@/components/pages/library-client";
import { ensureSchema, getSettings } from "@/lib/core";
import { listMediaLite } from "@/lib/media";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  await ensureSchema();
  const [items, s] = await Promise.all([listMediaLite(), getSettings()]);
  return <LibraryClient initial={items} imageSource={s.imageSource} />;
}
