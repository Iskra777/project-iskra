import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { createDiaryEntry, getDiaryEntries } from "@/lib/diary";

const createDiaryEntrySchema = z.object({
  title: z.string().trim().min(1).max(200).nullable().optional(),
  content: z.string().trim().min(1, "Запис не може бути порожнім").max(20000),
});

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const listQuerySchema = z.object({
  before: z.uuid().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .default(DEFAULT_LIMIT),
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
  const parsed = createDiaryEntrySchema.safeParse(body);

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

  const entry = await createDiaryEntry(userId, {
    title: parsed.data.title ?? null,
    content: parsed.data.content,
  });

  return NextResponse.json({ entry }, { status: 201 });
}

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
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

  const { before, limit } = parsed.data;

  const result = await getDiaryEntries(userId, before ?? null, limit);

  if (!result.ok) {
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

  return NextResponse.json({
    entries: result.entries,
    nextCursor: result.nextCursor,
  });
}
