import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { createPost } from "@/lib/posts";
import type { CreatePostErrorCode } from "@/lib/posts";

const ERROR_STATUS: Record<CreatePostErrorCode, number> = {
  community_not_found: 404,
  forbidden: 403,
};

const ERROR_MESSAGES: Record<CreatePostErrorCode, string> = {
  community_not_found: "Спільноту не знайдено.",
  forbidden: "Публікувати в цій спільноті можуть лише її учасники.",
};

const createPostSchema = z.object({
  content: z.string().trim().min(1, "Пост не може бути порожнім").max(5000),
  communityId: z.uuid().nullable().optional(),
  mediaUrl: z.url().nullable().optional(),
});

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = createPostSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Пост не може бути порожнім (максимум 5000 символів).",
        },
      },
      { status: 400 },
    );
  }

  const result = await createPost(
    userId,
    parsed.data.content,
    parsed.data.communityId ?? null,
    parsed.data.mediaUrl ?? null,
  );

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: result.code,
          message: ERROR_MESSAGES[result.code],
        },
      },
      { status: ERROR_STATUS[result.code] },
    );
  }

  return NextResponse.json({ post: { id: result.postId } }, { status: 201 });
}
