import { NextResponse } from "next/server";

import { revokeSession } from "@/lib/auth/session";
import {
  getRefreshTokenFromRequest,
  clearRefreshTokenCookie,
} from "@/lib/auth/cookies";

export async function POST(request: Request) {
  const refreshToken = getRefreshTokenFromRequest(request);

  if (refreshToken) {
    await revokeSession(refreshToken);
  }

  const response = NextResponse.json({ success: true });
  clearRefreshTokenCookie(response);
  return response;
}
