import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { sendMessageSchema } from "@/lib/message-validation";

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
  const parsed = sendMessageSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message:
            "Повідомлення не може бути порожнім (максимум 5000 символів).",
        },
      },
      { status: 400 },
    );
  }

  const { id: conversationId } = await params;

  // Не підтверджуємо існування розмови тим, хто в ній не бере участі —
  // однакова 404-відповідь для "розмови не існує" і "ти не учасник".
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });

  if (!participant) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Розмову не знайдено." } },
      { status: 404 },
    );
  }

  const now = new Date();

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        content: parsed.data.content,
        sentAt: now,
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: now },
    }),
    prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: now },
    }),
  ]);

  return NextResponse.json(
    {
      message: {
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        content: message.content,
        sentAt: message.sentAt,
      },
    },
    { status: 201 },
  );
}
