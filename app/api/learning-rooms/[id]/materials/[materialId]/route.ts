import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { deleteMaterial, editMaterial } from "@/lib/materials";
import type { MaterialMutationErrorCode } from "@/lib/materials";

const ERROR_STATUS: Record<MaterialMutationErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
};

const ERROR_MESSAGES: Record<MaterialMutationErrorCode, string> = {
  not_found: "Матеріал не знайдено.",
  forbidden: "Редагувати чи видаляти може лише автор або хост кімнати.",
};

const editMaterialSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Назва не може бути порожньою")
    .max(200)
    .optional(),
  url: z.url().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; materialId: string }> },
) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = editMaterialSchema.safeParse(body);

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

  const { materialId } = await params;

  const result = await editMaterial(materialId, userId, parsed.data);

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

  return NextResponse.json({ material: result.material });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; materialId: string }> },
) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const { materialId } = await params;

  const result = await deleteMaterial(materialId, userId);

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
