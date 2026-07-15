import { NextResponse } from "next/server";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { findParticipant, getConversationDetail } from "@/lib/conversations";

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

  const conversation = await getConversationDetail(conversationId, userId);

  return NextResponse.json({ conversation });
}
