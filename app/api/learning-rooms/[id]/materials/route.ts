import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { addMaterial, listMaterials } from "@/lib/materials";
import type { AddMaterialErrorCode } from "@/lib/materials";

const ADD_ERROR_STATUS: Record<AddMaterialErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
};

const ADD_ERROR_MESSAGES: Record<AddMaterialErrorCode, string> = {
  not_found: "Кімнату не знайдено.",
  forbidden: "Додавати матеріали можуть лише учасники кімнати.",
};

const addMaterialSchema = z.object({
  title: z.string().trim().min(1, "Назва не може бути порожньою").max(200),
  url: z.url(),
  note: z.string().trim().max(2000).nullable().optional(),
});

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
  const parsed = addMaterialSchema.safeParse(body);

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

  const { id: roomId } = await params;

  const result = await addMaterial(roomId, userId, {
    title: parsed.data.title,
    url: parsed.data.url,
    note: parsed.data.note ?? null,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: {
          code: result.code,
          message: ADD_ERROR_MESSAGES[result.code],
        },
      },
      { status: ADD_ERROR_STATUS[result.code] },
    );
  }

  return NextResponse.json({ material: result.material }, { status: 201 });
}

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

  const { id: roomId } = await params;

  const result = await listMaterials(roomId);

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Кімнату не знайдено." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ materials: result.materials });
}
