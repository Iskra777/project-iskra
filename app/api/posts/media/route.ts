import { NextResponse } from "next/server";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { detectImageType, uploadPostImage } from "@/lib/storage";

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
  const file = formData?.get("image");

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

  let mediaUrl: string;
  try {
    mediaUrl = await uploadPostImage(buffer);
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

  return NextResponse.json({ mediaUrl });
}
