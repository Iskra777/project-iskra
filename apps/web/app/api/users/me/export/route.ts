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

  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || user.deletedAt || !user.isActive) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  await prisma.auditLog.create({
    data: { userId, actorId: userId, action: "data_export_requested" },
  });

  return NextResponse.json(
    {
      exportedAt: new Date().toISOString(),
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
    },
    {
      headers: {
        "Content-Disposition": 'attachment; filename="iskra-data-export.json"',
      },
    },
  );
}
