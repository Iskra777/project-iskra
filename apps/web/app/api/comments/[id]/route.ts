import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { deleteComment, editComment } from "@/lib/comments";
import type { CommentMutationErrorCode } from "@/lib/comments";

const ERROR_STATUS: Record<CommentMutationErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
};

const ERROR_MESSAGES: Record<CommentMutationErrorCode, string> = {
  not_found: "Коментар не знайдено.",
  forbidden: "Редагувати чи видаляти може лише автор коментаря.",
};

const editCommentSchema = z.object({
  content: z.string().trim().min(1, "Коментар не може бути порожнім").max(5000),
});

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
  const parsed = editCommentSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Коментар не може бути порожнім (максимум 5000 символів).",
        },
      },
      { status: 400 },
    );
  }

  const { id: commentId } = await params;

  const result = await editComment(commentId, userId, parsed.data.content);

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
    comment: {
      id: commentId,
      content: result.content,
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

  const { id: commentId } = await params;

  const result = await deleteComment(commentId, userId);

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
