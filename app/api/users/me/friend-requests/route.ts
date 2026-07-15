import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth/current-user";

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const requests = await prisma.friendship.findMany({
    where: {
      addresseeId: userId,
      status: "pending",
      requester: { deletedAt: null, isActive: true },
    },
    orderBy: { createdAt: "desc" },
    include: {
      requester: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  return NextResponse.json({
    requests: requests.map((request) => ({
      id: request.id,
      createdAt: request.createdAt,
      requester: request.requester,
    })),
  });
}
