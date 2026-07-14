import type { NextResponse } from "next/server";
import { REFRESH_TOKEN_TTL_SECONDS } from "./tokens";

const COOKIE_NAME = "refresh_token";

export function setRefreshTokenCookie(
  response: NextResponse,
  token: string,
): void {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
  });
}

export function clearRefreshTokenCookie(response: NextResponse): void {
  response.cookies.delete({ name: COOKIE_NAME, path: "/api/auth" });
}

export function getRefreshTokenCookieName(): string {
  return COOKIE_NAME;
}
