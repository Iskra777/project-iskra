import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { deleteProject, editProject, getProject } from "@/lib/projects";
import type { ProjectMutationErrorCode } from "@/lib/projects";

const ERROR_STATUS: Record<ProjectMutationErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
};

const ERROR_MESSAGES: Record<ProjectMutationErrorCode, string> = {
  not_found: "Проєкт не знайдено.",
  forbidden: "Редагувати чи видаляти може лише адміністратор проєкту.",
};

const editProjectSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Назва не може бути порожньою")
    .max(200)
    .optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(["planning", "active", "completed", "archived"]).optional(),
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

  const { id: projectId } = await params;

  const result = await getProject(projectId, userId);

  if (!result.ok) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Проєкт не знайдено." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ project: result.project });
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
  const parsed = editProjectSchema.safeParse(body);

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

  const { id: projectId } = await params;

  const result = await editProject(projectId, userId, parsed.data);

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

  return NextResponse.json({ project: result.project });
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

  const { id: projectId } = await params;

  const result = await deleteProject(projectId, userId);

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
