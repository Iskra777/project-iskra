import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { deletePost, editPost, getPost } from "@/lib/posts";
import type { PostMutationErrorCode } from "@/lib/posts";

const ERROR_STATUS: Record<PostMutationErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
};

const ERROR_MESSAGES: Record<PostMutationErrorCode, string> = {
  not_found: "Пост не знайдено.",
  forbidden: "Редагувати чи видаляти може лише автор поста.",
};

const editPostSchema = z.object({
  content: z.string().trim().min(1, "Пост не може бути порожнім").max(5000),
  mediaUrl: z.url().nullable().optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const { id: postId } = await params;

  const result = await getPost(postId, userId);

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Пост не знайдено." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ post: result.post });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = editPostSchema.safeParse(body);

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

  const { id: postId } = await params;

  const result = await editPost(
    postId,
    userId,
    parsed.data.content,
    parsed.data.mediaUrl,
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

  return NextResponse.json({
    post: {
      id: postId,
      content: result.content,
      mediaUrl: result.mediaUrl,
      updatedAt: result.updatedAt,
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const { id: postId } = await params;

  const result = await deletePost(postId, userId);

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

  return NextResponse.json({ success: true });
}
