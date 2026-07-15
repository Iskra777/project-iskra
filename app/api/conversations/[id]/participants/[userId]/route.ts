import { NextResponse } from "next/server";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { removeGroupParticipant } from "@/lib/conversations";
import type { RemoveParticipantErrorCode } from "@/lib/conversations";

const ERROR_STATUS: Record<RemoveParticipantErrorCode, number> = {
  not_found: 404,
  not_a_group: 400,
  forbidden: 403,
  cannot_remove_self: 400,
  not_participant: 404,
};

const ERROR_MESSAGES: Record<RemoveParticipantErrorCode, string> = {
  not_found: "Розмову не знайдено.",
  not_a_group: "Це не групова розмова.",
  forbidden: "Лише адміністратор групи може видаляти учасників.",
  cannot_remove_self: "Щоб вийти з групи, використайте вихід (окрема дія).",
  not_participant: "Цей користувач не в групі.",
};

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const actorId = await getUserIdFromRequest(request);

  if (!actorId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const { id: conversationId, userId: targetUserId } = await params;

  const result = await removeGroupParticipant(
    conversationId,
    actorId,
    targetUserId,
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
