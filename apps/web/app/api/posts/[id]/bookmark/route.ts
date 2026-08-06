import { NextResponse } from "next/server";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { removeBookmark, setBookmark } from "@/lib/bookmarks";

export async function PUT(
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

  const result = await setBookmark(postId, userId);

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Пост не знайдено." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
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

  const result = await removeBookmark(postId, userId);

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Пост не знайдено." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
