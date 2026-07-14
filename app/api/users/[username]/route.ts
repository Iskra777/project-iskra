import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth/current-user";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const user = await prisma.user.findUnique({ where: { username } });

  // Деактивований/видалений акаунт — 404 для всіх без винятку, включно з
  // власником: такий акаунт однаково не може отримати свіжий токен (логін
  // блокує account_deactivated), тож "переглянути власний деактивований
  // профіль" — сценарій, який на практиці недосяжний.
  if (!user || user.deletedAt || !user.isActive) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Користувача не знайдено." } },
      { status: 404 },
    );
  }

  const publicProfile = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    location: user.location,
    createdAt: user.createdAt,
  };

  const requesterId = await getUserIdFromRequest(request);
  const isOwner = requesterId === user.id;

  if (!isOwner) {
    return NextResponse.json({ user: publicProfile });
  }

  return NextResponse.json({
    user: {
      ...publicProfile,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
      updatedAt: user.updatedAt,
    },
  });
}
