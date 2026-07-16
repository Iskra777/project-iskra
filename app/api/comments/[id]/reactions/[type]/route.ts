import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { removeCommentReaction, setCommentReaction } from "@/lib/reactions";

const reactionTypeSchema = z.enum(["fire", "bulb", "clap"]);

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const { id: commentId, type } = await params;
  const parsedType = reactionTypeSchema.safeParse(type);

  if (!parsedType.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: 'Тип реакції має бути "fire", "bulb" або "clap".',
        },
      },
      { status: 400 },
    );
  }

  const result = await setCommentReaction(commentId, userId, parsedType.data);

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Коментар не знайдено." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const { id: commentId, type } = await params;
  const parsedType = reactionTypeSchema.safeParse(type);

  if (!parsedType.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: 'Тип реакції має бути "fire", "bulb" або "clap".',
        },
      },
      { status: 400 },
    );
  }

  const result = await removeCommentReaction(
    commentId,
    userId,
    parsedType.data,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Коментар не знайдено." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
