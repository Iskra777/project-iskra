import { NextResponse } from "next/server";
import { z } from "zod";

import { emailSchema } from "@/lib/auth/validation";
import { requestPasswordReset } from "@/lib/auth/password-reset";
import { checkRateLimit, recordAttempt } from "@/lib/rate-limit";

const schema = z.object({ email: emailSchema });

const WINDOW_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS_PER_EMAIL = 3;
const MAX_ATTEMPTS_PER_IP = 10;

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const ipKey = `password-reset:ip:${ip}`;

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
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    recordAttempt(ipKey, WINDOW_MS);
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Невалідний email.",
        },
      },
      { status: 400 },
    );
  }

  // Ключ по email рахується незалежно від того, чи існує акаунт — сам факт
  // rate-limit не видає, чи зареєстрований цей email (перевірка ліміту йде
  // до перевірки існування користувача всередині requestPasswordReset).
  const emailKey = `password-reset:email:${parsed.data.email}`;
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
  recordAttempt(emailKey, WINDOW_MS);
  recordAttempt(ipKey, WINDOW_MS);

  await requestPasswordReset(parsed.data.email);

  return NextResponse.json({ success: true });
}
