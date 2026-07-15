import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import {
  removeGroupParticipant,
  transferGroupAdmin,
} from "@/lib/conversations";
import type {
  RemoveParticipantErrorCode,
  TransferAdminErrorCode,
} from "@/lib/conversations";

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

const TRANSFER_ERROR_STATUS: Record<TransferAdminErrorCode, number> = {
  not_found: 404,
  not_a_group: 400,
  forbidden: 403,
  not_participant: 404,
};

const TRANSFER_ERROR_MESSAGES: Record<TransferAdminErrorCode, string> = {
  not_found: "Розмову не знайдено.",
  not_a_group: "Це не групова розмова.",
  forbidden: "Лише адміністратор групи може призначати інших адміністраторів.",
  not_participant: "Цей користувач не в групі.",
};

// Єдине підтримуване значення поки що — підвищення до admin. Пониження
// назад до member не входить у цю задачу (немає вимоги в плані).
const patchParticipantSchema = z.object({ role: z.literal("admin") });

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
  const parsed = patchParticipantSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: 'Підтримується лише { "role": "admin" }.',
        },
      },
      { status: 400 },
    );
  }

  const { id: conversationId, userId: targetUserId } = await params;

  const result = await transferGroupAdmin(
    conversationId,
    actorId,
    targetUserId,
  );

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: result.code,
          message: TRANSFER_ERROR_MESSAGES[result.code],
        },
      },
      { status: TRANSFER_ERROR_STATUS[result.code] },
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
