import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { deleteEvent, editEvent, getEvent } from "@/lib/events";
import type { EventMutationErrorCode } from "@/lib/events";

const ERROR_STATUS: Record<EventMutationErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
};

const ERROR_MESSAGES: Record<EventMutationErrorCode, string> = {
  not_found: "Подію не знайдено.",
  forbidden: "Редагувати чи видаляти може лише організатор події.",
};

const editEventSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Назва не може бути порожньою")
      .max(200)
      .optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    format: z.enum(["online", "offline"]).optional(),
    locationOrLink: z.string().trim().max(500).nullable().optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().nullable().optional(),
  })
  .refine(
    (data) => !data.endsAt || !data.startsAt || data.endsAt > data.startsAt,
    {
      message: "Дата завершення має бути пізніше за дату початку",
      path: ["endsAt"],
    },
  );

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

  const { id: eventId } = await params;

  const result = await getEvent(eventId, userId);

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Подію не знайдено." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ event: result.event });
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
  const parsed = editEventSchema.safeParse(body);

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

  const { id: eventId } = await params;

  const result = await editEvent(eventId, userId, parsed.data);

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: result.code,
          message: ERROR_MESSAGES[result.code],
        },
      },
      { status: ERROR_STATUS[result.code] },
    );
  }

  return NextResponse.json({ event: result.event });
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

  const { id: eventId } = await params;

  const result = await deleteEvent(eventId, userId);

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: result.code,
          message: ERROR_MESSAGES[result.code],
        },
      },
      { status: ERROR_STATUS[result.code] },
    );
  }

  return NextResponse.json({ success: true });
}
