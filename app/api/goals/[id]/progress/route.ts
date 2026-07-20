import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { addProgress, getProgressHistory } from "@/lib/progress";

const addProgressSchema = z.object({
  value: z.number().int().nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const historyQuerySchema = z.object({
  before: z.uuid().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .default(DEFAULT_LIMIT),
});

export async function POST(
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
  const parsed = addProgressSchema.safeParse(body);

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

  const result = await addProgress(goalId, userId, {
    value: parsed.data.value ?? null,
    note: parsed.data.note ?? null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Ціль не знайдено." } },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { progress: result.progress, newAchievements: result.newAchievements },
    { status: 201 },
  );
}

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

  const { searchParams } = new URL(request.url);
  const parsed = historyQuerySchema.safeParse({
    before: searchParams.get("before") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Невалідні параметри пагінації.",
        },
      },
      { status: 400 },
    );
  }

  const { id: goalId } = await params;
  const { before, limit } = parsed.data;

  const result = await getProgressHistory(
    goalId,
    userId,
    before ?? null,
    limit,
  );

  if (!result.ok) {
    if (result.code === "invalid_cursor") {
      return NextResponse.json(
        {
          error: {
            code: "validation_error",
            message: "Невалідний курсор пагінації.",
          },
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: { code: "not_found", message: "Ціль не знайдено." } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    progress: result.progress,
    nextCursor: result.nextCursor,
  });
}
