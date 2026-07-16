import { NextResponse } from "next/server";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { joinCommunity } from "@/lib/communities";

const ERROR_STATUS = {
  not_found: 404,
  already_member: 409,
} as const;

const ERROR_MESSAGES = {
  not_found: "Спільноту не знайдено.",
  already_member: "Ти вже учасник або маєш заявку на вступ.",
} as const;

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

  const { id: communityId } = await params;

  const result = await joinCommunity(communityId, userId);

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

  return NextResponse.json({ status: result.status }, { status: 201 });
}
