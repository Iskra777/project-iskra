import { prisma } from "@/lib/prisma";

export type CreateCommunityResult =
  { ok: true; communityId: string } | { ok: false; code: "name_taken" };

/** Творець одразу отримує `CommunityMember(role=admin, status=approved)`
 * (DATABASE.md#community → Рішення дизайну). Перевірка унікальності `name`
 * заздалегідь + backstop на P2002 — той самий патерн, що й реєстрація
 * (lib/auth/registration-availability.ts): check-then-act, gонка ловиться
 * унікальним індексом у БД. */
export async function createCommunity(
  ownerId: string,
  name: string,
  description: string | null,
  visibility: "public" | "private",
): Promise<CreateCommunityResult> {
  const existing = await prisma.community.findUnique({ where: { name } });
  if (existing) {
    return { ok: false, code: "name_taken" };
  }

  try {
    const community = await prisma.community.create({
      data: {
        ownerId,
        name,
        description,
        visibility,
        members: {
          create: [{ userId: ownerId, role: "admin", status: "approved" }],
        },
      },
    });

    return { ok: true, communityId: community.id };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return { ok: false, code: "name_taken" };
    }
    throw error;
  }
}

export function findMembership(communityId: string, userId: string) {
  return prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
}

export type JoinCommunityResult =
  | { ok: true; status: "approved" | "pending" }
  | { ok: false; code: "not_found" | "already_member" };

/**
 * `public` — одразу `approved`. `private` — `pending`, чекає на схвалення
 * admin/moderator (DATABASE.md#community → Рішення дизайну). Заявку до
 * приватної спільноти можна подати, навіть не будучи учасником — це і є
 * сенс вступу, тож тут немає anti-enumeration 404 за видимістю, лише за
 * фактом існування спільноти.
 */
export async function joinCommunity(
  communityId: string,
  userId: string,
): Promise<JoinCommunityResult> {
  const community = await prisma.community.findUnique({
    where: { id: communityId },
  });
  if (!community) {
    return { ok: false, code: "not_found" };
  }

  const existing = await findMembership(communityId, userId);
  if (existing) {
    return { ok: false, code: "already_member" };
  }

  const status = community.visibility === "public" ? "approved" : "pending";

  try {
    await prisma.communityMember.create({
      data: { communityId, userId, role: "member", status },
    });
    return { ok: true, status };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return { ok: false, code: "already_member" };
    }
    throw error;
  }
}

export type LeaveCommunityErrorCode =
  "not_found" | "owner_required" | "invalid_new_owner";

/**
 * Власник не може вийти без передачі `ownerId` — на відміну від групових
 * чатів (де перевірка "останній admin"), тут єдина умова — саме поле
 * `ownerId`, бо `admin`-роль і без того може бути в декількох одночасно
 * (DATABASE.md#community → Рішення дизайну). Новий власник має бути вже
 * `approved` учасником; отримує `admin`, якщо ще не мав цієї ролі.
 */
export async function leaveCommunity(
  communityId: string,
  userId: string,
  newOwnerId?: string,
): Promise<{ ok: true } | { ok: false; code: LeaveCommunityErrorCode }> {
  const membership = await findMembership(communityId, userId);
  if (!membership) {
    return { ok: false, code: "not_found" };
  }

  const community = await prisma.community.findUniqueOrThrow({
    where: { id: communityId },
  });

  if (community.ownerId === userId) {
    if (!newOwnerId) {
      return { ok: false, code: "owner_required" };
    }

    const successor = await findMembership(communityId, newOwnerId);
    if (!successor || successor.status !== "approved") {
      return { ok: false, code: "invalid_new_owner" };
    }

    await prisma.$transaction([
      prisma.community.update({
        where: { id: communityId },
        data: { ownerId: newOwnerId },
      }),
      prisma.communityMember.update({
        where: { id: successor.id },
        data: { role: "admin" },
      }),
      prisma.communityMember.delete({ where: { id: membership.id } }),
    ]);
    return { ok: true };
  }

  await prisma.communityMember.delete({ where: { id: membership.id } });
  return { ok: true };
}

export type RespondToJoinRequestErrorCode =
  "not_found" | "forbidden" | "no_pending_request";

/** Лише `admin`/`moderator` (`approved`) можуть схвалювати/відхиляти
 * заявки. Відхилення видаляє рядок — той самий підхід, що й у запитах
 * дружби (не позначаємо "rejected", просто прибираємо). */
export async function respondToJoinRequest(
  communityId: string,
  actorId: string,
  targetUserId: string,
  action: "approve" | "reject",
): Promise<{ ok: true } | { ok: false; code: RespondToJoinRequestErrorCode }> {
  const actor = await findMembership(communityId, actorId);
  if (!actor || actor.status !== "approved") {
    return { ok: false, code: "not_found" };
  }

  if (actor.role !== "admin" && actor.role !== "moderator") {
    return { ok: false, code: "forbidden" };
  }

  const target = await findMembership(communityId, targetUserId);
  if (!target || target.status !== "pending") {
    return { ok: false, code: "no_pending_request" };
  }

  if (action === "approve") {
    await prisma.communityMember.update({
      where: { id: target.id },
      data: { status: "approved" },
    });
  } else {
    await prisma.communityMember.delete({ where: { id: target.id } });
  }

  return { ok: true };
}
