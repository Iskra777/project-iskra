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
