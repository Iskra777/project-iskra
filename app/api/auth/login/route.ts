import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticateUser } from "@/lib/auth/authenticate";
import { createSession } from "@/lib/auth/session";
import { setRefreshTokenCookie } from "@/lib/auth/cookies";
import { checkRateLimit, recordFailedAttempt } from "@/lib/rate-limit";
import { emailSchema } from "@/lib/auth/validation";

const loginSchema = z.object({
  email: emailSchema,
  // Мінімальна перевірка, не passwordSchema: complexity-правила застосовуються
  // лише при встановленні пароля (реєстрація/зміна), не при вході — інакше
  // старий акаунт з паролем коротшим за нові правила не зміг би залогінитись.
  password: z.string().min(1),
});

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_EMAIL = 5;
const MAX_ATTEMPTS_PER_IP = 20;

function errorResponse(
  code: string,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const ipKey = `login:ip:${ip}`;

  const ipLimit = checkRateLimit(ipKey, MAX_ATTEMPTS_PER_IP, WINDOW_MS);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: "Забагато спроб." } },
      {
        status: 429,
        headers: { "Retry-After": String(ipLimit.retryAfterSeconds) },
      },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    recordFailedAttempt(ipKey, WINDOW_MS);
    return errorResponse(
      "validation_error",
      "Невалідний email або пароль.",
      400,
    );
  }

  // emailSchema уже нормалізує в нижній регістр — тут повторний .toLowerCase() не потрібен.
  const emailKey = `login:email:${parsed.data.email}`;
  const emailLimit = checkRateLimit(
    emailKey,
    MAX_ATTEMPTS_PER_EMAIL,
    WINDOW_MS,
  );
  if (!emailLimit.allowed) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: "Забагато спроб." } },
      {
        status: 429,
        headers: { "Retry-After": String(emailLimit.retryAfterSeconds) },
      },
    );
  }

  const result = await authenticateUser(
    parsed.data.email,
    parsed.data.password,
  );

  if (!result.ok) {
    recordFailedAttempt(ipKey, WINDOW_MS);
    recordFailedAttempt(emailKey, WINDOW_MS);

    const messages: Record<typeof result.code, string> = {
      invalid_credentials: "Невірний email або пароль.",
      email_not_verified: "Підтвердіть email перед входом.",
      account_deactivated: "Акаунт деактивовано.",
    };
    const statuses: Record<typeof result.code, number> = {
      invalid_credentials: 401,
      email_not_verified: 403,
      account_deactivated: 403,
    };
    return errorResponse(
      result.code,
      messages[result.code],
      statuses[result.code],
    );
  }

  const session = await createSession(result.user.id);

  const response = NextResponse.json({
    user: result.user,
    accessToken: session.accessToken,
  });
  setRefreshTokenCookie(response, session.refreshToken);
  return response;
}
