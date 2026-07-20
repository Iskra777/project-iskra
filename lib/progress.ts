import { prisma } from "@/lib/prisma";
import { checkProgressRecordedAchievements } from "@/lib/achievements";
import type { NewAchievement } from "@/lib/achievements";

export interface ProgressRecord {
  id: string;
  value: number | null;
  note: string | null;
  recordedAt: Date;
}

export type ProgressErrorCode = "not_found";

export type AddProgressResult =
  | { ok: true; progress: ProgressRecord; newAchievements: NewAchievement[] }
  | { ok: false; code: ProgressErrorCode };

export interface AddProgressInput {
  value: number | null;
  note: string | null;
}

/** Лише власник цілі — той самий anti-enumeration підхід, що й lib/goals.ts
 * (чужа/неіснуюча ціль дає однакову `not_found`). */
export async function addProgress(
  goalId: string,
  userId: string,
  input: AddProgressInput,
): Promise<AddProgressResult> {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId },
  });
  if (!goal) return { ok: false, code: "not_found" };

  const record = await prisma.progress.create({
    data: { userId, goalId, value: input.value, note: input.note },
  });
  const newAchievements = await checkProgressRecordedAchievements(userId);

  return {
    ok: true,
    progress: {
      id: record.id,
      value: record.value,
      note: record.note,
      recordedAt: record.recordedAt,
    },
    newAchievements,
  };
}

export type GetProgressHistoryErrorCode = "not_found" | "invalid_cursor";

export type GetProgressHistoryResult =
  | { ok: true; progress: ProgressRecord[]; nextCursor: string | null }
  | { ok: false; code: GetProgressHistoryErrorCode };

/**
 * Історія прогресу цілі, найновіші перші. Курсорна пагінація — той самий
 * підхід, що й getFeed/getBookmarks (lib/feed.ts, lib/bookmarks.ts):
 * `recordedAt`+`id` tie-break, курсор перевіряється в межах цілі заздалегідь.
 */
export async function getProgressHistory(
  goalId: string,
  userId: string,
  before: string | null,
  limit: number,
): Promise<GetProgressHistoryResult> {
  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId },
  });
  if (!goal) return { ok: false, code: "not_found" };

  if (before) {
    const cursorRecord = await prisma.progress.findFirst({
      where: { id: before, goalId },
    });
    if (!cursorRecord) return { ok: false, code: "invalid_cursor" };
  }

  const records = await prisma.progress.findMany({
    where: { goalId },
    orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
    take: limit,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
  });

  const nextCursor =
    records.length === limit ? records[records.length - 1].id : null;

  return {
    ok: true,
    progress: records.map((record) => ({
      id: record.id,
      value: record.value,
      note: record.note,
      recordedAt: record.recordedAt,
    })),
    nextCursor,
  };
}
