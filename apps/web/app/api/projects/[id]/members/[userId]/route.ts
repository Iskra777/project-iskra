import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { changeProjectMemberRole, removeProjectMember } from "@/lib/projects";
import type {
  ChangeProjectMemberRoleErrorCode,
  RemoveProjectMemberErrorCode,
} from "@/lib/projects";

const ROLE_ERROR_STATUS: Record<ChangeProjectMemberRoleErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  target_not_member: 404,
  cannot_change_owner_role: 400,
};

const ROLE_ERROR_MESSAGES: Record<ChangeProjectMemberRoleErrorCode, string> = {
  not_found: "Проєкт не знайдено.",
  forbidden: "Лише адміністратор може змінювати ролі.",
  target_not_member: "Цей користувач не є учасником проєкту.",
  cannot_change_owner_role: "Роль власника змінити не можна.",
};

const REMOVE_ERROR_STATUS: Record<RemoveProjectMemberErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  target_not_member: 404,
  owner_cannot_leave: 400,
};

const REMOVE_ERROR_MESSAGES: Record<RemoveProjectMemberErrorCode, string> = {
  not_found: "Проєкт не знайдено.",
  forbidden: "Немає прав видалити цього учасника.",
  target_not_member: "Цей користувач не є учасником проєкту.",
  owner_cannot_leave:
    "Власник не може вийти — видаліть проєкт або передайте його комусь іншому.",
};

const patchSchema = z.object({ role: z.enum(["admin", "member"]) });

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
          message: 'Тіло має містити "role" ("admin"/"member").',
        },
      },
      { status: 400 },
    );
  }

  const { id: projectId, userId: targetUserId } = await params;

  const result = await changeProjectMemberRole(
    projectId,
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

  const { id: projectId, userId: targetUserId } = await params;

  const result = await removeProjectMember(projectId, actorId, targetUserId);

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
