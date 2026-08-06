import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { createLearningRoom, listLearningRooms } from "@/lib/learning-rooms";

const createRoomSchema = z.object({
  title: z.string().trim().min(1, "Назва не може бути порожньою").max(200),
  description: z.string().trim().max(5000).nullable().optional(),
});

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const listRoomsQuerySchema = z.object({
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
  const parsed = createRoomSchema.safeParse(body);

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

  const room = await createLearningRoom(userId, {
    title: parsed.data.title,
    description: parsed.data.description ?? null,
  });

  return NextResponse.json({ room }, { status: 201 });
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
  const parsed = listRoomsQuerySchema.safeParse({
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

  const result = await listLearningRooms(before ?? null, limit);

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
    rooms: result.rooms,
    nextCursor: result.nextCursor,
  });
}
