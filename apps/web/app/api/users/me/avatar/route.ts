import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { detectImageType, uploadAvatar } from "@/lib/storage";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("avatar");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Файл не надано." } },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      {
        error: {
          code: "file_too_large",
          message: "Файл завеликий (максимум 5MB).",
        },
      },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Реальні байти, не заголовок Content-Type від клієнта — той можна підробити.
  if (!detectImageType(buffer)) {
    return NextResponse.json(
      {
        error: {
          code: "unsupported_file_type",
          message: "Підтримуються лише PNG, JPEG, WEBP.",
        },
      },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing || existing.deletedAt || !existing.isActive) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  let avatarUrl: string;
  try {
    avatarUrl = await uploadAvatar(userId, buffer);
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "upload_failed",
          message: "Не вдалося завантажити файл.",
        },
      },
      { status: 502 },
    );
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl },
  });

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      location: user.location,
      createdAt: user.createdAt,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
      updatedAt: user.updatedAt,
    },
  });
}
