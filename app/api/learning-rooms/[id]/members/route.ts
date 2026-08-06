import { NextResponse } from "next/server";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { joinLearningRoom, leaveLearningRoom } from "@/lib/learning-rooms";
import type { LeaveLearningRoomErrorCode } from "@/lib/learning-rooms";

const LEAVE_ERROR_STATUS: Record<LeaveLearningRoomErrorCode, number> = {
  not_found: 404,
  host_cannot_leave: 400,
};

const LEAVE_ERROR_MESSAGES: Record<LeaveLearningRoomErrorCode, string> = {
  not_found: "Кімнату не знайдено.",
  host_cannot_leave: "Хост не може вийти з кімнати, яку створив.",
};

export async function PUT(
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

  const result = await joinLearningRoom(roomId, userId);

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Кімнату не знайдено." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
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

  const result = await leaveLearningRoom(roomId, userId);

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: result.code,
          message: LEAVE_ERROR_MESSAGES[result.code],
        },
      },
      { status: LEAVE_ERROR_STATUS[result.code] },
    );
  }

  return NextResponse.json({ success: true });
}
