import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { deleteDiaryEntry, editDiaryEntry, getDiaryEntry } from "@/lib/diary";
import type { DiaryEntryErrorCode } from "@/lib/diary";

const ERROR_STATUS: Record<DiaryEntryErrorCode, number> = {
  not_found: 404,
};

const ERROR_MESSAGES: Record<DiaryEntryErrorCode, string> = {
  not_found: "Запис не знайдено.",
};

const editDiaryEntrySchema = z.object({
  title: z.string().trim().min(1).max(200).nullable().optional(),
  content: z
    .string()
    .trim()
    .min(1, "Запис не може бути порожнім")
    .max(20000)
    .optional(),
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

  const { id: entryId } = await params;

  const result = await getDiaryEntry(entryId, userId);

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: result.code, message: ERROR_MESSAGES[result.code] } },
      { status: ERROR_STATUS[result.code] },
    );
  }

  return NextResponse.json({ entry: result.entry });
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
  const parsed = editDiaryEntrySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Перевірте правильність введених даних.",
        },
      },
      { status: 400 },
    );
  }

  const { id: entryId } = await params;

  const result = await editDiaryEntry(entryId, userId, parsed.data);

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: result.code, message: ERROR_MESSAGES[result.code] } },
      { status: ERROR_STATUS[result.code] },
    );
  }

  return NextResponse.json({ entry: result.entry });
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

  const { id: entryId } = await params;

  const result = await deleteDiaryEntry(entryId, userId);

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: result.code, message: ERROR_MESSAGES[result.code] } },
      { status: ERROR_STATUS[result.code] },
    );
  }

  return NextResponse.json({ success: true });
}
