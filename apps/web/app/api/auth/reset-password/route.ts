import { NextResponse } from "next/server";
import { z } from "zod";

import { passwordSchema } from "@/lib/auth/validation";
import { resetPassword } from "@/lib/auth/password-reset";

const schema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    const paths = parsed.error.issues.map((issue) => issue.path[0]);
    const onlyPasswordFailed =
      paths.length > 0 && paths.every((path) => path === "password");

    if (onlyPasswordFailed) {
      return NextResponse.json(
        {
          error: {
            code: "weak_password",
            message: "Пароль має містити від 8 до 128 символів.",
          },
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: { code: "validation_error", message: "Токен відсутній." } },
      { status: 400 },
    );
  }

  const result = await resetPassword(parsed.data.token, parsed.data.password);

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_token",
          message: "Посилання недійсне або протерміноване.",
        },
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true });
}
