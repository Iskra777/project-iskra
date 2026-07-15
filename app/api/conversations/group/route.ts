import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { usernameSchema } from "@/lib/auth/validation";
import { createGroupConversation } from "@/lib/conversations";

const MIN_INVITEES = 2;

// Менше двох запрошених — це, по суті, direct-розмова (POST /api/conversations),
// не група. Мінімум не з БД, а продуктове рішення цього ендпоінта.
const createGroupSchema = z.object({
  title: z.string().trim().min(1, "Назва обов'язкова").max(100),
  usernames: z
    .array(usernameSchema)
    .min(MIN_INVITEES, `Мінімум ${MIN_INVITEES} запрошених`)
    .max(100),
});

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = createGroupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: `Потрібна назва й мінімум ${MIN_INVITEES} запрошених.`,
        },
      },
      { status: 400 },
    );
  }

  const usernames = [...new Set(parsed.data.usernames)];

  const users = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true, username: true, deletedAt: true, isActive: true },
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

  const memberIds = validUsers.map((u) => u.id).filter((id) => id !== userId);

  if (memberIds.length < MIN_INVITEES) {
    // Власний username у списку запрошених — після виключення творця
    // лишилось замало людей.
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: `Потрібна назва й мінімум ${MIN_INVITEES} запрошених.`,
        },
      },
      { status: 400 },
    );
  }

  const { conversationId } = await createGroupConversation(
    userId,
    parsed.data.title,
    memberIds,
  );

  return NextResponse.json(
    { conversation: { id: conversationId } },
    { status: 201 },
  );
}
