import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { removeFriendship } from "@/lib/friendships";

const ERROR_STATUS: Record<string, number> = {
  friendship_not_found: 404,
  cannot_unblock: 403,
};

const ERROR_MESSAGES: Record<string, string> = {
  friendship_not_found: "Стосунків із цим користувачем не знайдено.",
  cannot_unblock: "Розблокувати може лише той, хто заблокував.",
};

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const { username } = await params;
  const other = await prisma.user.findUnique({ where: { username } });

  if (!other || other.deletedAt || !other.isActive) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Користувача не знайдено." } },
      { status: 404 },
    );
  }

  const result = await removeFriendship(userId, other.id);

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
