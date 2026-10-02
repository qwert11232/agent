import SettingsClient from "@/components/pages/settings-client";
import { getSettings } from "@/lib/core";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await getSettings();
  return <SettingsClient initial={s} />;
}
