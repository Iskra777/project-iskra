import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { createProject, listProjects } from "@/lib/projects";

const createProjectSchema = z.object({
  title: z.string().trim().min(1, "Назва не може бути порожньою").max(200),
  description: z.string().trim().max(5000).nullable().optional(),
});

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = createProjectSchema.safeParse(body);

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

  const project = await createProject(userId, {
    title: parsed.data.title,
    description: parsed.data.description ?? null,
  });

  return NextResponse.json({ project }, { status: 201 });
}

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const projects = await listProjects(userId);

  return NextResponse.json({ projects });
}
