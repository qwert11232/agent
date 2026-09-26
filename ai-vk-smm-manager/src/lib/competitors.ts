import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { competitors, type Competitor } from "@/db/schema";
import { getSettings, logActivity } from "./core";
import { aiComplete } from "./gpt";
import { cleanGroupId, isRealVkToken, vkApi } from "./vk";

type VkWallItem = {
  id: number;
  date: number;
  text: string;
  likes?: { count: number };
  comments?: { count: number };
  views?: { count: number };
};

/** Обновляет метрики одного конкурента через VK wall.get + groups.getById. */
export async function refreshCompetitor(row: Competitor, token: string) {
  const gid = cleanGroupId(row.groupId);
  if (!gid && !row.groupId) return row;

  const info = await vkApi<{ groups?: { name?: string; members_count?: number }[] }>(
    token,
    "groups.getById",
    { group_id: row.groupId, fields: "members_count" },
  );
  const group = info?.groups?.[0];

  const wall = await vkApi<{ items?: VkWallItem[] }>(token, "wall.get", {
    domain: /^\d+$/.test(row.groupId) ? "" : row.groupId,
    ...(/^\d+$/.test(row.groupId) ? { owner_id: `-${row.groupId}` } : {}),
    count: "30",
  });

  const items = wall?.items ?? [];
  const weekAgo = Date.now() / 1000 - 7 * 86400;
  const recent = items.filter((i) => i.date >= weekAgo);
  const likes = items.map((i) => i.likes?.count ?? 0);
  const top = items.slice().sort((a, b) => (b.likes?.count ?? 0) - (a.likes?.count ?? 0))[0];

  const patch = {
    name: group?.name ?? row.name ?? row.groupId,
    followers: group?.members_count ?? row.followers,
    avgLikes: likes.length
      ? Math.round(likes.reduce((a, b) => a + b, 0) / likes.length)
      : row.avgLikes,
    postsWeek: recent.length,
    topPostText: top?.text?.slice(0, 400) ?? row.topPostText,
    topPostLikes: top?.likes?.count ?? row.topPostLikes,
    lastCheckedAt: new Date(),
  };

  const updated = (
    await db.update(competitors).set(patch).where(eq(competitors.id, row.id)).returning()
  )[0];
  return updated;
}

export async function refreshAllCompetitors() {
  const s = await getSettings();
  if (!isRealVkToken(s.vkToken)) {
    return { live: false, updated: 0 };
  }
  const rows = await db.select().from(competitors);
  let updated = 0;
  for (const row of rows) {
    const res = await refreshCompetitor(row, s.vkToken);
    if (res.lastCheckedAt) updated++;
  }
  if (updated) {
    await logActivity("КОНКУРЕНТЫ ОБНОВЛЕНЫ", `Проанализировано сообществ: ${updated}.`, "info");
  }
  return { live: true, updated };
}

export async function listCompetitors() {
  return db.select().from(competitors).orderBy(desc(competitors.avgLikes));
}

/** Еженедельный дайджест конкурентов + рекомендации (AI или эвристика). */
export async function competitorDigest(myAvgLikes: number, myPostsWeek: number) {
  const rows = await listCompetitors();
  if (!rows.length) return null;
  const s = await getSettings();

  const summary = rows
    .map(
      (c) =>
        `«${c.name || c.groupId}»: подписчиков ${c.followers}, средние лайки ${c.avgLikes}, постов за неделю ${c.postsWeek}, лучший пост (${c.topPostLikes} лайков): ${c.topPostText.slice(0, 200)}`,
    )
    .join("\n");

  const ai = await aiComplete(
    s.gptKey,
    [
      {
        role: "system",
        content:
          "Ты — SMM-аналитик. На основе данных о конкурентах дай краткий дайджест на русском: 3–5 пунктов что у них работает и 2–3 конкретные рекомендации владельцу. Без воды, маркированным списком.",
      },
      {
        role: "user",
        content: `Мои показатели: средние лайки ${myAvgLikes}, постов за неделю ${myPostsWeek}.\n\nКонкуренты:\n${summary}`,
      },
    ],
    600,
  );
  if (ai) return ai;

  const leader = rows[0];
  const lines = [
    `• Лидер по вовлечённости — «${leader.name || leader.groupId}»: ${leader.avgLikes} лайков в среднем при ${leader.postsWeek} постах в неделю.`,
    `• Их лучший пост собрал ${leader.topPostLikes} лайков.`,
  ];
  if (leader.avgLikes > myAvgLikes) {
    lines.push(
      `• Вы отстаёте на ${Math.round(((leader.avgLikes - myAvgLikes) / Math.max(leader.avgLikes, 1)) * 100)}% по лайкам — изучите их удачные темы.`,
    );
  }
  if (leader.postsWeek > myPostsWeek) {
    lines.push(`• Они публикуют чаще (${leader.postsWeek} против ваших ${myPostsWeek}) — добавьте слоты в расписание.`);
  }
  return lines.join("\n");
}
