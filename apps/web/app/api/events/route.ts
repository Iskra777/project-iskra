import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { createEvent, listEvents } from "@/lib/events";

const createEventSchema = z
  .object({
    title: z.string().trim().min(1, "Назва не може бути порожньою").max(200),
    description: z.string().trim().max(5000).nullable().optional(),
    format: z.enum(["online", "offline"]),
    locationOrLink: z.string().trim().max(500).nullable().optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().nullable().optional(),
  })
  .refine((data) => !data.endsAt || data.endsAt > data.startsAt, {
    message: "Дата завершення має бути пізніше за дату початку",
    path: ["endsAt"],
  });

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const listEventsQuerySchema = z.object({
  after: z.uuid().optional(),
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
  const parsed = createEventSchema.safeParse(body);

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

  const event = await createEvent(userId, {
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    format: parsed.data.format,
    locationOrLink: parsed.data.locationOrLink ?? null,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt ?? null,
  });

  return NextResponse.json({ event }, { status: 201 });
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
  const parsed = listEventsQuerySchema.safeParse({
    after: searchParams.get("after") ?? undefined,
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

  const { after, limit } = parsed.data;

  const result = await listEvents(after ?? null, limit);

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
    events: result.events,
    nextCursor: result.nextCursor,
  });
}
