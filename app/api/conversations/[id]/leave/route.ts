import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { leaveGroup } from "@/lib/conversations";
import type { LeaveGroupErrorCode } from "@/lib/conversations";

const ERROR_STATUS: Record<LeaveGroupErrorCode, number> = {
  not_found: 404,
  not_a_group: 400,
  admin_required: 400,
  invalid_new_admin: 400,
};

const ERROR_MESSAGES: Record<LeaveGroupErrorCode, string> = {
  not_found: "Розмову не знайдено.",
  not_a_group: "Це не групова розмова.",
  admin_required:
    "Ти єдиний адміністратор групи — вкажи newAdminUserId, кому передати права, перед виходом.",
  invalid_new_admin: "Вказаний користувач не є учасником цієї групи.",
};

const leaveSchema = z.object({
  newAdminUserId: z.uuid().optional(),
});

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

  const body = await request.json().catch(() => ({}));
  const parsed = leaveSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Невалідний newAdminUserId.",
        },
      },
      { status: 400 },
    );
  }

  const { id: conversationId } = await params;

  const result = await leaveGroup(
    conversationId,
    userId,
    parsed.data.newAdminUserId,
  );

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
