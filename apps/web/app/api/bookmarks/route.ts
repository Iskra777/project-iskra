import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { getBookmarks } from "@/lib/bookmarks";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const bookmarksQuerySchema = z.object({
  before: z.uuid().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .default(DEFAULT_LIMIT),
});

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = bookmarksQuerySchema.safeParse({
    before: searchParams.get("before") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Невалідні параметри пагінації.",
        },
      },
      { status: 400 },
    );
  }

  const { before, limit } = parsed.data;

  const result = await getBookmarks(userId, before ?? null, limit);

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Невалідний курсор пагінації.",
        },
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    posts: result.posts,
    nextCursor: result.nextCursor,
  });
}
