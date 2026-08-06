import { NextResponse } from "next/server";

import { refreshSession } from "@/lib/auth/session";
import {
  getRefreshTokenFromRequest,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} from "@/lib/auth/cookies";

export async function POST(request: Request) {
  const refreshToken = getRefreshTokenFromRequest(request);

  if (!refreshToken) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Сесія недійсна." } },
      { status: 401 },
    );
  }

  const result = await refreshSession(refreshToken);

  if (!result.ok) {
    const response = NextResponse.json(
      { error: { code: "invalid_token", message: "Сесія недійсна." } },
      { status: 401 },
    );
    clearRefreshTokenCookie(response);
    return response;
  }

  const response = NextResponse.json({
    accessToken: result.session.accessToken,
  });
  setRefreshTokenCookie(response, result.session.refreshToken);
  return response;
}
