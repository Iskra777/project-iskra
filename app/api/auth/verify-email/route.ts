import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyEmailToken } from "@/lib/auth/email-verification";

const schema = z.object({ token: z.string().min(1) });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Токен відсутній." } },
      { status: 400 },
    );
  }

  const result = await verifyEmailToken(parsed.data.token);

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
