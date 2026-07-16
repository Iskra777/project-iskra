import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { createComment, listComments } from "@/lib/comments";
import type { CreateCommentErrorCode } from "@/lib/comments";

const ERROR_STATUS: Record<CreateCommentErrorCode, number> = {
  post_not_found: 404,
  parent_not_found: 404,
  nested_reply_not_allowed: 400,
};

const ERROR_MESSAGES: Record<CreateCommentErrorCode, string> = {
  post_not_found: "Пост не знайдено.",
  parent_not_found: "Коментар, на який ви відповідаєте, не знайдено.",
  nested_reply_not_allowed:
    "Можна відповідати лише на коментарі верхнього рівня.",
};

const createCommentSchema = z.object({
  content: z.string().trim().min(1, "Коментар не може бути порожнім").max(5000),
  parentCommentId: z.uuid().nullable().optional(),
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

  const result = await listComments(postId, userId);

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: "post_not_found", message: "Пост не знайдено." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ comments: result.comments });
}

export async function POST(
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
  const parsed = createCommentSchema.safeParse(body);

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

  const { id: postId } = await params;

  const result = await createComment(
    postId,
    userId,
    parsed.data.content,
    parsed.data.parentCommentId ?? null,
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

  return NextResponse.json(
    { comment: { id: result.commentId } },
    { status: 201 },
  );
}
