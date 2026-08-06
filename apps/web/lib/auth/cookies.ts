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

/**
 * Cookie спершу — це основний шлях для веба. `X-Refresh-Token`-заголовок —
 * fallback лише для мобільного клієнта (React Native `fetch` не має
 * браузерного cookie jar для httpOnly-кук), не альтернатива для веба.
 */
export function getRefreshTokenFromRequest(
  request: Request,
): string | undefined {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  const fromCookie = match?.split("=").slice(1).join("=");
  if (fromCookie) return fromCookie;

  return request.headers.get("x-refresh-token") ?? undefined;
}

/** Мобільний клієнт позначає себе цим заголовком на кожному auth-запиті —
 * лише тоді `refreshToken` додається в тіло JSON-відповіді (веб ніколи
 * його не шле, тож для веба поведінка не змінюється — refresh-токен
 * лишається виключно в httpOnly cookie, недосяжній для XSS). */
export function isMobileClient(request: Request): boolean {
  return request.headers.get("x-client") === "mobile";
}
