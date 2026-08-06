import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { createCommunity, listCommunities } from "@/lib/communities";

const createCommunitySchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Мінімум 3 символи")
    .max(50, "Максимум 50 символів"),
  description: z.string().trim().max(1000).nullable().optional(),
  visibility: z.enum(["public", "private"]),
});

// На відміну від пошуку користувачів (lib/search-validation.ts), тут
// порожній `q` — легітимний "перегляд усіх" (обмежено LIST_LIMIT), не
// помилка.
const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Пошуковий запит закороткий.",
        },
      },
      { status: 400 },
    );
  }

  const communities = await listCommunities(parsed.data.q || null);

  return NextResponse.json({ communities });
}

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = createCommunitySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Перевірте назву, опис і видимість.",
        },
      },
      { status: 400 },
    );
  }

  const result = await createCommunity(
    userId,
    parsed.data.name,
    parsed.data.description ?? null,
    parsed.data.visibility,
  );

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: "name_taken",
          message: "Спільнота з такою назвою вже існує.",
        },
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { community: { id: result.communityId } },
    { status: 201 },
  );
}
