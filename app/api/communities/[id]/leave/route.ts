import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { leaveCommunity } from "@/lib/communities";
import type { LeaveCommunityErrorCode } from "@/lib/communities";

const ERROR_STATUS: Record<LeaveCommunityErrorCode, number> = {
  not_found: 404,
  owner_required: 400,
  invalid_new_owner: 400,
};

const ERROR_MESSAGES: Record<LeaveCommunityErrorCode, string> = {
  not_found: "Спільноту не знайдено.",
  owner_required:
    "Ти власник спільноти — вкажи newOwnerId, кому передати права, перед виходом.",
  invalid_new_owner:
    "Вказаний користувач не є підтвердженим учасником цієї спільноти.",
};

const leaveSchema = z.object({
  newOwnerId: z.uuid().optional(),
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
          message: "Невалідний newOwnerId.",
        },
      },
      { status: 400 },
    );
  }

  const { id: communityId } = await params;

  const result = await leaveCommunity(
    communityId,
    userId,
    parsed.data.newOwnerId,
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
