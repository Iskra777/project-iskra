import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth/current-user";

const userSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  deletedAt: true,
  isActive: true,
} as const;

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);

  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_token", message: "Не авторизовано." } },
      { status: 401 },
    );
  }

  const friendships = await prisma.friendship.findMany({
    where: {
      status: "accepted",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      requester: { select: userSelect },
      addressee: { select: userSelect },
    },
  });

  // Після accepted напрямок requester/addressee не має значення —
  // потрібен саме "інший" учасник пари, і лише якщо він досі активний.
  const friends = friendships
    .map((friendship) =>
      friendship.requesterId === userId
        ? friendship.addressee
        : friendship.requester,
    )
    .filter((friend) => !friend.deletedAt && friend.isActive)
    .map(({ id, username, displayName, avatarUrl }) => ({
      id,
      username,
      displayName,
      avatarUrl,
    }));

  return NextResponse.json({ friends });
}
