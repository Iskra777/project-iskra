import { NextResponse } from "next/server";
import { z } from "zod";

import { getUserIdFromRequest } from "@/lib/auth/current-user";
import { addProjectMembers } from "@/lib/projects";
import type { AddMembersErrorCode } from "@/lib/projects";

const ERROR_STATUS: Record<AddMembersErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
};

const ERROR_MESSAGES: Record<AddMembersErrorCode, string> = {
  not_found: "Проєкт не знайдено.",
  forbidden: "Лише адміністратор може додавати учасників.",
};

const addMembersSchema = z.object({
  userIds: z.array(z.uuid()).min(1).max(50),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actorId = await getUserIdFromRequest(request);

  if (!actorId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = addMembersSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Потрібен непорожній список userIds (максимум 50).",
        },
      },
      { status: 400 },
    );
  }

  const { id: projectId } = await params;

  const result = await addProjectMembers(
    projectId,
    actorId,
    parsed.data.userIds,
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

  return NextResponse.json({ success: true });
}
