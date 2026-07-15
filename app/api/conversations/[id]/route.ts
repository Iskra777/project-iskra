import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { findParticipant } from "@/lib/conversations";

export async function GET(
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

  const { id: conversationId } = await params;

  const participant = await findParticipant(conversationId, userId);
  if (!participant) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Розмову не знайдено." } },
      { status: 404 },
    );
  }

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: {
      participants: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });

  const otherParticipant =
    conversation.type === "direct"
      ? (conversation.participants.find((p) => p.userId !== userId)?.user ??
        null)
      : null;

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      type: conversation.type,
      otherParticipant,
    },
  });
}
