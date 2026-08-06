import { prisma } from "@/lib/prisma";

export type SendFriendRequestResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "cannot_friend_self"
        | "blocked"
        | "request_already_pending"
        | "already_friends";
    };

/**
 * Переходи станів задокументовані в DATABASE.md → Friendship. Унікальність
 * пари без урахування напрямку перевіряється тут (findFirst в обидва боки),
 * не на рівні БД — вузьке вікно гонки при одночасних зустрічних запитах
 * прийнятне для MVP.
 */
export async function sendFriendRequest(
  requesterId: string,
  addresseeId: string,
): Promise<SendFriendRequestResult> {
  if (requesterId === addresseeId) {
    return { ok: false, code: "cannot_friend_self" };
  }

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId, addresseeId },
        { requesterId: addresseeId, addresseeId: requesterId },
      ],
    },
  });

  if (existing?.status === "blocked") {
    return { ok: false, code: "blocked" };
  }
  if (existing?.status === "pending") {
    return { ok: false, code: "request_already_pending" };
  }
  if (existing?.status === "accepted") {
    return { ok: false, code: "already_friends" };
  }

  await prisma.friendship.create({
    data: { requesterId, addresseeId, status: "pending" },
  });

  return { ok: true };
}

export type RespondToFriendRequestResult =
  { ok: true } | { ok: false; code: "friend_request_not_found" };

/** `reject` видаляє рядок — за DATABASE.md `pending` не має окремого
 * статусу "rejected", лише accepted/blocked або відсутність рядка. */
export async function respondToFriendRequest(
  requesterId: string,
  addresseeId: string,
  action: "accept" | "reject",
): Promise<RespondToFriendRequestResult> {
  const existing = await prisma.friendship.findFirst({
    where: { requesterId, addresseeId, status: "pending" },
  });

  if (!existing) {
    return { ok: false, code: "friend_request_not_found" };
  }

  if (action === "accept") {
    await prisma.friendship.update({
      where: { id: existing.id },
      data: { status: "accepted" },
    });
  } else {
    await prisma.friendship.delete({ where: { id: existing.id } });
  }

  return { ok: true };
}

export type RemoveFriendshipResult =
  { ok: true } | { ok: false; code: "friendship_not_found" | "cannot_unblock" };

/**
 * Прибирає стосунок, у якому `userId` учасник (незалежно від напрямку).
 * `pending`/`accepted` — видаляється завжди; `blocked` — лише якщо `userId`
 * є блокувальником (`requesterId` рядка), інакше `cannot_unblock`.
 */
export async function removeFriendship(
  userId: string,
  otherUserId: string,
): Promise<RemoveFriendshipResult> {
  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: userId, addresseeId: otherUserId },
        { requesterId: otherUserId, addresseeId: userId },
      ],
    },
  });

  if (!existing) {
    return { ok: false, code: "friendship_not_found" };
  }

  if (existing.status === "blocked" && existing.requesterId !== userId) {
    return { ok: false, code: "cannot_unblock" };
  }

  await prisma.friendship.delete({ where: { id: existing.id } });

  return { ok: true };
}

export type BlockUserResult =
  { ok: true } | { ok: false; code: "cannot_block_self" | "already_blocked" };

/** Блокує незалежно від поточного стану (немає рядка/pending/accepted) —
 * блокувальник завжди стає requesterId, перезаписуючи попередній напрямок. */
export async function blockUser(
  blockerId: string,
  blockedId: string,
): Promise<BlockUserResult> {
  if (blockerId === blockedId) {
    return { ok: false, code: "cannot_block_self" };
  }

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: blockerId, addresseeId: blockedId },
        { requesterId: blockedId, addresseeId: blockerId },
      ],
    },
  });

  if (existing?.status === "blocked") {
    return { ok: false, code: "already_blocked" };
  }

  if (existing) {
    await prisma.friendship.update({
      where: { id: existing.id },
      data: {
        requesterId: blockerId,
        addresseeId: blockedId,
        status: "blocked",
      },
    });
  } else {
    await prisma.friendship.create({
      data: {
        requesterId: blockerId,
        addresseeId: blockedId,
        status: "blocked",
      },
    });
  }

  return { ok: true };
}

export type FriendshipStatusView =
  | "none"
  | "pending_sent"
  | "pending_received"
  | "accepted"
  | "blocked_by_viewer"
  | "blocked_by_other";

/** Статус стосунку з точки зору `viewerId`, що дивиться на профіль
 * `targetId` — для UI-кнопки "додати/видалити друга" на профілі. */
export async function getFriendshipStatus(
  viewerId: string,
  targetId: string,
): Promise<FriendshipStatusView> {
  const row = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: viewerId, addresseeId: targetId },
        { requesterId: targetId, addresseeId: viewerId },
      ],
    },
  });

  if (!row) return "none";
  if (row.status === "accepted") return "accepted";

  if (row.status === "pending") {
    return row.requesterId === viewerId ? "pending_sent" : "pending_received";
  }

  return row.requesterId === viewerId
    ? "blocked_by_viewer"
    : "blocked_by_other";
}
