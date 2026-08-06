import { NextResponse } from "next/server";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { getLearningRoom } from "@/lib/learning-rooms";

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

  const { id: roomId } = await params;

  const result = await getLearningRoom(roomId, userId);

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Кімнату не знайдено." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ room: result.room });
}
