import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { usernameSchema } from "@/lib/auth/validation";
import { addGroupParticipants } from "@/lib/conversations";
import type { GroupParticipantsErrorCode } from "@/lib/conversations";

const addParticipantsSchema = z.object({
  usernames: z.array(usernameSchema).min(1).max(100),
});

const ERROR_STATUS: Record<GroupParticipantsErrorCode, number> = {
  not_found: 404,
  not_a_group: 400,
  forbidden: 403,
};

const ERROR_MESSAGES: Record<GroupParticipantsErrorCode, string> = {
  not_found: "Розмову не знайдено.",
  not_a_group: "Це не групова розмова.",
  forbidden: "Лише адміністратор групи може додавати учасників.",
};

export async function POST(
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
  const parsed = addParticipantsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Потрібен масив usernames.",
        },
      },
      { status: 400 },
    );
  }

  const { id: conversationId } = await params;
  const usernames = [...new Set(parsed.data.usernames)];

  const users = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true, deletedAt: true, isActive: true },
  });
  const validUsers = users.filter((u) => !u.deletedAt && u.isActive);

  if (validUsers.length !== usernames.length) {
    return NextResponse.json(
      {
        error: {
          code: "not_found",
          message: "Одного або кількох користувачів не знайдено.",
        },
      },
      { status: 404 },
    );
  }

  const result = await addGroupParticipants(
    conversationId,
    userId,
    validUsers.map((u) => u.id),
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
