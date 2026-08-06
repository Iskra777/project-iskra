import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { findParticipant } from "@/lib/conversations";

export async function PATCH(
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

  const lastReadAt = new Date();
  const notifyPayload = JSON.stringify({ conversationId, userId, lastReadAt });

  await prisma.$transaction([
    prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt },
    }),
    // Той самий підхід, що й у POST .../messages — NOTIFY усередині
    // транзакції, доставляється лише після коміту.
    prisma.$executeRaw`SELECT pg_notify('conversation_read', ${notifyPayload})`,
  ]);

  return NextResponse.json({ lastReadAt });
}
