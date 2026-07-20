import { prisma } from "@/lib/prisma";

/**
 * DATABASE.md → Achievement → Правила й тригери нарахування (Phase 4).
 * Лише домен Goal/Progress цієї фази — без ретроактивних тригерів для
 * друзів/постів/спільнот.
 */
export type AchievementCode =
  | "first_goal_created"
  | "first_progress_recorded"
  | "first_goal_completed"
  | "five_goals_completed";

const ACHIEVEMENT_CATALOG: Record<
  AchievementCode,
  { title: string; description: string }
> = {
  first_goal_created: {
    title: "Перший крок",
    description: "Ти створив(-ла) свою першу ціль.",
  },
  first_progress_recorded: {
    title: "Почала руху",
    description: "Ти додав(-ла) свій перший запис прогресу.",
  },
  first_goal_completed: {
    title: "Досягнуто",
    description: "Ти завершив(-ла) свою першу ціль.",
  },
  five_goals_completed: {
    title: "Впевнений крок",
    description: "Ти завершив(-ла) п'ять цілей.",
  },
};

/** Лінькво створює каталожний рядок при першому нарахуванні — без
 * окремого seed-скрипта (DATABASE.md → Achievement). */
async function ensureAchievement(code: AchievementCode) {
  const meta = ACHIEVEMENT_CATALOG[code];
  return prisma.achievement.upsert({
    where: { code },
    create: { code, title: meta.title, description: meta.description },
    update: {},
  });
}

export interface NewAchievement {
  code: AchievementCode;
  title: string;
  description: string | null;
}

/**
 * Ідемпотентно — `@@unique([userId, achievementId])` захищає від дублів
 * навіть при гонитві. Повертає нараховане досягнення, лише якщо саме цей
 * виклик нарахував його вперше (для "стриманого" сповіщення в UI — не
 * показувати toast на кожен повторний no-op виклик).
 */
async function award(
  userId: string,
  code: AchievementCode,
): Promise<NewAchievement | null> {
  const achievement = await ensureAchievement(code);

  const existing = await prisma.userAchievement.findUnique({
    where: { userId_achievementId: { userId, achievementId: achievement.id } },
  });
  if (existing) return null;

  try {
    await prisma.userAchievement.create({
      data: { userId, achievementId: achievement.id },
    });
  } catch {
    // Гонитва з паралельним викликом, який устиг нарахувати першим —
    // досягнення вже є, просто не "щойно від цього виклику".
    return null;
  }

  return {
    code: achievement.code as AchievementCode,
    title: achievement.title,
    description: achievement.description,
  };
}

export async function checkGoalCreatedAchievements(
  userId: string,
): Promise<NewAchievement[]> {
  const count = await prisma.goal.count({ where: { userId } });
  if (count < 1) return [];
  const earned = await award(userId, "first_goal_created");
  return earned ? [earned] : [];
}

export async function checkProgressRecordedAchievements(
  userId: string,
): Promise<NewAchievement[]> {
  const count = await prisma.progress.count({ where: { userId } });
  if (count < 1) return [];
  const earned = await award(userId, "first_progress_recorded");
  return earned ? [earned] : [];
}

export async function checkGoalCompletedAchievements(
  userId: string,
): Promise<NewAchievement[]> {
  const completedCount = await prisma.goal.count({
    where: { userId, status: "completed" },
  });

  const results: NewAchievement[] = [];
  if (completedCount >= 1) {
    const earned = await award(userId, "first_goal_completed");
    if (earned) results.push(earned);
  }
  if (completedCount >= 5) {
    const earned = await award(userId, "five_goals_completed");
    if (earned) results.push(earned);
  }
  return results;
}

export interface EarnedAchievement {
  code: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
  earnedAt: Date;
}

/** Лише вже отримані досягнення — без locked-списку недосягнутого
 * (Principle 2: не підштовхувати до "доганяння" прогрес-бару). */
export async function listUserAchievements(
  userId: string,
): Promise<EarnedAchievement[]> {
  const rows = await prisma.userAchievement.findMany({
    where: { userId },
    orderBy: { earnedAt: "desc" },
    include: { achievement: true },
  });

  return rows.map((row) => ({
    code: row.achievement.code,
    title: row.achievement.title,
    description: row.achievement.description,
    iconUrl: row.achievement.iconUrl,
    earnedAt: row.earnedAt,
  }));
}
