import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { blockUser } from "@/lib/friendships";

const ERROR_STATUS: Record<string, number> = {
  cannot_block_self: 400,
  already_blocked: 409,
};

const ERROR_MESSAGES: Record<string, string> = {
  cannot_block_self: "Не можна заблокувати самого себе.",
  already_blocked: "Цей користувач уже заблокований.",
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const blockerId = await getUserIdFromRequest(request);

  if (!blockerId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const { username } = await params;
  const target = await prisma.user.findUnique({ where: { username } });

  if (!target || target.deletedAt || !target.isActive) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Користувача не знайдено." } },
      { status: 404 },
    );
  }

  const result = await blockUser(blockerId, target.id);

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
