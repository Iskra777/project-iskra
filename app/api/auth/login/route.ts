import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticateUser } from "@/lib/auth/authenticate";
import { createSession } from "@/lib/auth/session";
import { setRefreshTokenCookie } from "@/lib/auth/cookies";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function errorResponse(
  code: string,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(
      "validation_error",
      "Невалідний email або пароль.",
      400,
    );
  }

  const result = await authenticateUser(
    parsed.data.email,
    parsed.data.password,
  );

  if (!result.ok) {
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
