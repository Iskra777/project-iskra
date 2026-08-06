import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { searchQuerySchema } from "@/lib/search-validation";

const RESULT_LIMIT = 20;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = searchQuerySchema.safeParse({
    q: searchParams.get("q") ?? "",
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Пошуковий запит має містити щонайменше 2 символи.",
        },
      },
      { status: 400 },
    );
  }

  const { q } = parsed.data;

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      OR: [
        { username: { contains: q, mode: "insensitive" } },
        { displayName: { contains: q, mode: "insensitive" } },
      ],
    },
    take: RESULT_LIMIT,
    orderBy: { username: "asc" },
  });

  return NextResponse.json({
    users: users.map((user) => ({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    })),
  });
}
