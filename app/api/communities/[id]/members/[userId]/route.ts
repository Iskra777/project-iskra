import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { respondToJoinRequest } from "@/lib/communities";
import type { RespondToJoinRequestErrorCode } from "@/lib/communities";

const ERROR_STATUS: Record<RespondToJoinRequestErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  no_pending_request: 404,
};

const ERROR_MESSAGES: Record<RespondToJoinRequestErrorCode, string> = {
  not_found: "Спільноту не знайдено.",
  forbidden: "Лише адміністратор або модератор може розглядати заявки.",
  no_pending_request: "Немає заявки на вступ від цього користувача.",
};

const respondSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

export async function PATCH(
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

  const body = await request.json().catch(() => null);
  const parsed = respondSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: 'action має бути "approve" або "reject".',
        },
      },
      { status: 400 },
    );
  }

  const { id: communityId, userId: targetUserId } = await params;

  const result = await respondToJoinRequest(
    communityId,
    actorId,
    targetUserId,
    parsed.data.action,
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
