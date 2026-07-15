import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth/current-user";
import {
  createDirectConversation,
  listConversations,
} from "@/lib/conversations";

const createConversationSchema = z.object({
  username: z.string().min(1),
});

const ERROR_STATUS: Record<string, number> = {
  cannot_message_self: 400,
  blocked: 403,
};

const ERROR_MESSAGES: Record<string, string> = {
  cannot_message_self: "Не можна написати самому собі.",
  blocked: "Неможливо почати розмову.",
};

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const conversations = await listConversations(userId);

  return NextResponse.json({ conversations });
}

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = createConversationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Поле username обов'язкове.",
        },
      },
      { status: 400 },
    );
  }

  const other = await prisma.user.findUnique({
    where: { username: parsed.data.username },
  });

  if (!other || other.deletedAt || !other.isActive) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Користувача не знайдено." } },
      { status: 404 },
    );
  }

  const result = await createDirectConversation(userId, other.id);

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

  return NextResponse.json(
    {
      conversation: {
        id: result.conversationId,
        otherParticipant: {
          id: other.id,
          username: other.username,
          displayName: other.displayName,
          avatarUrl: other.avatarUrl,
        },
      },
    },
    { status: result.created ? 201 : 200 },
  );
}
