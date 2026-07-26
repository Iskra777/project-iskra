import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { removeAttendance, setAttendance } from "@/lib/events";

const attendanceSchema = z.object({
  status: z.enum(["going", "interested"]),
});

export async function PUT(
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
  const parsed = attendanceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Статус має бути 'going' або 'interested'.",
        },
      },
      { status: 400 },
    );
  }

  const { id: eventId } = await params;

  const result = await setAttendance(eventId, userId, parsed.data.status);

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Подію не знайдено." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
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

  const result = await removeAttendance(eventId, userId);

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Подію не знайдено." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
