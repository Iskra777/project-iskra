import { prisma } from "@/lib/prisma";
import {
  checkGoalCompletedAchievements,
  checkGoalCreatedAchievements,
} from "@/lib/achievements";
import type { NewAchievement } from "@/lib/achievements";

export type GoalStatus = "active" | "completed" | "abandoned";

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  deadline: Date | null;
  status: GoalStatus;
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toGoal(goal: {
  id: string;
  title: string;
  description: string | null;
  deadline: Date | null;
  status: GoalStatus;
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
}): Goal {
  return {
    id: goal.id,
    title: goal.title,
    description: goal.description,
    deadline: goal.deadline,
    status: goal.status,
    isPrivate: goal.isPrivate,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
}

export interface CreateGoalInput {
  title: string;
  description: string | null;
  deadline: Date | null;
  isPrivate: boolean;
}

export interface CreateGoalResult {
  goal: Goal;
  newAchievements: NewAchievement[];
}

export async function createGoal(
  userId: string,
  input: CreateGoalInput,
): Promise<CreateGoalResult> {
  const goal = await prisma.goal.create({
    data: {
      userId,
      title: input.title,
      description: input.description,
      deadline: input.deadline,
      isPrivate: input.isPrivate,
    },
  });
  const newAchievements = await checkGoalCreatedAchievements(userId);
  return { goal: toGoal(goal), newAchievements };
}

/** Лише власні цілі глядача — Goal не має жодного стану "видно, але не
 * можна редагувати", тому список завжди скоупиться на userId. */
export async function listGoals(userId: string): Promise<Goal[]> {
  const goals = await prisma.goal.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return goals.map(toGoal);
}

export type GoalErrorCode = "not_found";

export type GetGoalResult =
  { ok: true; goal: Goal } | { ok: false; code: GoalErrorCode };

/**
 * Чужа/неіснуюча ціль → однаково `not_found` (anti-enumeration, як
 * приватні спільноти) — на відміну від постів тут немає легітимного
 * "бачу, але не можу редагувати" стану.
 */
export async function getGoal(
  goalId: string,
  userId: string,
): Promise<GetGoalResult> {
  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } });
  if (!goal) return { ok: false, code: "not_found" };
  return { ok: true, goal: toGoal(goal) };
}

export interface EditGoalInput {
  title?: string;
  description?: string | null;
  deadline?: Date | null;
  status?: GoalStatus;
  isPrivate?: boolean;
}

export type EditGoalResult =
  | { ok: true; goal: Goal; newAchievements: NewAchievement[] }
  | { ok: false; code: GoalErrorCode };

export async function editGoal(
  goalId: string,
  userId: string,
  input: EditGoalInput,
): Promise<EditGoalResult> {
  const existing = await prisma.goal.findFirst({
    where: { id: goalId, userId },
  });
  if (!existing) return { ok: false, code: "not_found" };

  const goal = await prisma.goal.update({
    where: { id: goalId },
    data: input,
  });
  const newAchievements =
    input.status === "completed"
      ? await checkGoalCompletedAchievements(userId)
      : [];
  return { ok: true, goal: toGoal(goal), newAchievements };
}

export type DeleteGoalResult =
  { ok: true } | { ok: false; code: GoalErrorCode };

/** Жорстке видалення — Goal, на відміну від Post/Comment, не має
 * `deletedAt` у схемі (DATABASE.md). */
export async function deleteGoal(
  goalId: string,
  userId: string,
): Promise<DeleteGoalResult> {
  const existing = await prisma.goal.findFirst({
    where: { id: goalId, userId },
  });
  if (!existing) return { ok: false, code: "not_found" };

  await prisma.goal.delete({ where: { id: goalId } });
  return { ok: true };
}
