import { CalendarClock, FileText, GalleryHorizontal, Images, Newspaper, Palette } from "lucide-react";
import { HubBar } from "@/components/hub";
import { LibraryTab, PostsTab } from "@/components/server-tabs";
import { CarouselClient, DigestClient } from "@/components/pages/studio-client";
import PlannerClient from "@/components/pages/planner-client";
import { DesignClient } from "@/components/pages/design-client";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "posts", label: "Посты", icon: FileText },
  { id: "planner", label: "Планировщик", icon: CalendarClock },
  { id: "carousel", label: "Карусели", icon: GalleryHorizontal },
  { id: "digest", label: "Дайджест", icon: Newspaper },
  { id: "library", label: "Фото", icon: Images },
  { id: "design", label: "Дизайн", icon: Palette },
];

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return (
    <>
      <HubBar base="/content" active={tab ?? "posts"} tabs={TABS} />
      {tab === "planner" ? (
        <PlannerClient />
      ) : tab === "carousel" ? (
        <CarouselClient />
      ) : tab === "digest" ? (
        <DigestClient />
      ) : tab === "library" ? (
        <LibraryTab />
      ) : tab === "design" ? (
        <DesignClient />
      ) : (
        <PostsTab />
      )}
    </>
  );
}
