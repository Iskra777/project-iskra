import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import {
  changeMemberRole,
  removeMember,
  respondToJoinRequest,
} from "@/lib/communities";
import type {
  ChangeMemberRoleErrorCode,
  RemoveMemberErrorCode,
  RespondToJoinRequestErrorCode,
} from "@/lib/communities";

const JOIN_REQUEST_ERROR_STATUS: Record<RespondToJoinRequestErrorCode, number> =
  {
    not_found: 404,
    forbidden: 403,
    no_pending_request: 404,
  };

const JOIN_REQUEST_ERROR_MESSAGES: Record<
  RespondToJoinRequestErrorCode,
  string
> = {
  not_found: "Спільноту не знайдено.",
  forbidden: "Лише адміністратор або модератор може розглядати заявки.",
  no_pending_request: "Немає заявки на вступ від цього користувача.",
};

const ROLE_ERROR_STATUS: Record<ChangeMemberRoleErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  target_not_member: 404,
  cannot_change_owner_role: 400,
};

const ROLE_ERROR_MESSAGES: Record<ChangeMemberRoleErrorCode, string> = {
  not_found: "Спільноту не знайдено.",
  forbidden: "Лише адміністратор може змінювати ролі.",
  target_not_member: "Цей користувач не є учасником спільноти.",
  cannot_change_owner_role:
    "Роль власника не можна змінити напряму — спочатку передайте право власності.",
};

const REMOVE_ERROR_STATUS: Record<RemoveMemberErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  target_not_member: 404,
  cannot_remove_self: 400,
  cannot_remove_owner: 400,
};

const REMOVE_ERROR_MESSAGES: Record<RemoveMemberErrorCode, string> = {
  not_found: "Спільноту не знайдено.",
  forbidden: "Немає прав видалити цього учасника.",
  target_not_member: "Цей користувач не є учасником спільноти.",
  cannot_remove_self: "Щоб покинути спільноту, скористайтеся виходом.",
  cannot_remove_owner: "Власника не можна видалити.",
};

const patchSchema = z.union([
  z.object({ action: z.enum(["approve", "reject"]) }),
  z.object({ role: z.enum(["admin", "moderator", "member"]) }),
]);

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
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message:
            'Тіло має містити або "action" ("approve"/"reject"), або "role" ("admin"/"moderator"/"member").',
        },
      },
      { status: 400 },
    );
  }

  const { id: communityId, userId: targetUserId } = await params;

  if ("action" in parsed.data) {
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
            message: JOIN_REQUEST_ERROR_MESSAGES[result.code],
          },
        },
        { status: JOIN_REQUEST_ERROR_STATUS[result.code] },
      );
    }

    return NextResponse.json({ success: true });
  }

  const result = await changeMemberRole(
    communityId,
    actorId,
    targetUserId,
    parsed.data.role,
  );

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: result.code,
          message: ROLE_ERROR_MESSAGES[result.code],
        },
      },
      { status: ROLE_ERROR_STATUS[result.code] },
    );
  }

  return NextResponse.json({ success: true });
}

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

  const { id: communityId, userId: targetUserId } = await params;

  const result = await removeMember(communityId, actorId, targetUserId);

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: result.code,
          message: REMOVE_ERROR_MESSAGES[result.code],
        },
      },
      { status: REMOVE_ERROR_STATUS[result.code] },
    );
  }

  return NextResponse.json({ success: true });
}
