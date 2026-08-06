import { NextResponse } from "next/server";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { listUserAchievements } from "@/lib/achievements";

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const achievements = await listUserAchievements(userId);

  return NextResponse.json({ achievements });
}
