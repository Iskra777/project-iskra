import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { createGoal, listGoals } from "@/lib/goals";

const createGoalSchema = z.object({
  title: z.string().trim().min(1, "Назва не може бути порожньою").max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  deadline: z.coerce.date().nullable().optional(),
  isPrivate: z.boolean().optional(),
});

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = createGoalSchema.safeParse(body);

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

  const { goal, newAchievements } = await createGoal(userId, {
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    deadline: parsed.data.deadline ?? null,
    isPrivate: parsed.data.isPrivate ?? true,
  });

  return NextResponse.json({ goal, newAchievements }, { status: 201 });
}

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const goals = await listGoals(userId);

  return NextResponse.json({ goals });
}
