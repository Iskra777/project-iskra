import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { sendFriendRequest, respondToFriendRequest } from "@/lib/friendships";

const respondSchema = z.object({
  action: z.enum(["accept", "reject"]),
});

const ERROR_STATUS: Record<string, number> = {
  cannot_friend_self: 400,
  blocked: 403,
  request_already_pending: 409,
  already_friends: 409,
};

const ERROR_MESSAGES: Record<string, string> = {
  cannot_friend_self: "Не можна надіслати запит дружби самому собі.",
  blocked: "Неможливо надіслати запит.",
  request_already_pending: "Запит дружби вже надіслано.",
  already_friends: "Ви вже друзі.",
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const requesterId = await getUserIdFromRequest(request);

  if (!requesterId) {
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

  const result = await sendFriendRequest(requesterId, target.id);

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

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const addresseeId = await getUserIdFromRequest(request);

  if (!addresseeId) {
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
          message: "Поле action має бути 'accept' або 'reject'.",
        },
      },
      { status: 400 },
    );
  }

  const { username } = await params;
  const requester = await prisma.user.findUnique({ where: { username } });

  if (!requester || requester.deletedAt || !requester.isActive) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Користувача не знайдено." } },
      { status: 404 },
    );
  }

  const result = await respondToFriendRequest(
    requester.id,
    addresseeId,
    parsed.data.action,
  );

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: "friend_request_not_found",
          message: "Запит дружби не знайдено.",
        },
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
