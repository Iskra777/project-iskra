import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { deleteGoal, editGoal, getGoal } from "@/lib/goals";
import type { GoalErrorCode } from "@/lib/goals";

const ERROR_STATUS: Record<GoalErrorCode, number> = {
  not_found: 404,
};

const ERROR_MESSAGES: Record<GoalErrorCode, string> = {
  not_found: "Ціль не знайдено.",
};

const editGoalSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Назва не може бути порожньою")
    .max(200)
    .optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  deadline: z.coerce.date().nullable().optional(),
  status: z.enum(["active", "completed", "abandoned"]).optional(),
  isPrivate: z.boolean().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const { id: goalId } = await params;

  const result = await getGoal(goalId, userId);

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: result.code, message: ERROR_MESSAGES[result.code] } },
      { status: ERROR_STATUS[result.code] },
    );
  }

  return NextResponse.json({ goal: result.goal });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = editGoalSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Перевірте правильність введених даних.",
        },
      },
      { status: 400 },
    );
  }

  const { id: goalId } = await params;

  const result = await editGoal(goalId, userId, parsed.data);

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: result.code, message: ERROR_MESSAGES[result.code] } },
      { status: ERROR_STATUS[result.code] },
    );
  }

  return NextResponse.json({
    goal: result.goal,
    newAchievements: result.newAchievements,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const { id: goalId } = await params;

  const result = await deleteGoal(goalId, userId);

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: result.code, message: ERROR_MESSAGES[result.code] } },
      { status: ERROR_STATUS[result.code] },
    );
  }

  return NextResponse.json({ success: true });
}
