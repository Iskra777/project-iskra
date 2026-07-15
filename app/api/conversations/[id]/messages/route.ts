import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth/current-user";
import {
  sendMessageSchema,
  messageHistoryQuerySchema,
} from "@/lib/message-validation";
import { findParticipant } from "@/lib/conversations";

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
  const participant = await findParticipant(conversationId, userId);

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

  const { searchParams } = new URL(request.url);
  const parsed = messageHistoryQuerySchema.safeParse({
    before: searchParams.get("before") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Невалідні параметри пагінації.",
        },
      },
      { status: 400 },
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

  const { before, limit } = parsed.data;

  if (before) {
    // Prisma кидає помилку на неіснуючий cursor — перевіряємо заздалегідь,
    // заразом підтверджуючи, що курсор дійсно з цієї розмови.
    const cursorMessage = await prisma.message.findFirst({
      where: { id: before, conversationId },
    });
    if (!cursorMessage) {
      return NextResponse.json(
        {
          error: {
            code: "validation_error",
            message: "Невалідний курсор пагінації.",
          },
        },
        { status: 400 },
      );
    }
  }

  const messages = await prisma.message.findMany({
    where: { conversationId, deletedAt: null },
    orderBy: [{ sentAt: "desc" }, { id: "desc" }],
    take: limit,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
  });

  const nextCursor =
    messages.length === limit ? messages[messages.length - 1].id : null;

  return NextResponse.json({
    messages: messages.map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      content: message.content,
      sentAt: message.sentAt,
      editedAt: message.editedAt,
    })),
    nextCursor,
  });
}
