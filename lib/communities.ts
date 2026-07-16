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

export type ChangeMemberRoleErrorCode =
  "not_found" | "forbidden" | "target_not_member" | "cannot_change_owner_role";

/** Лише `admin` (approved) може змінювати ролі — на відміну від заявок на
 * вступ, це чутливіша дія, тож `moderator` тут без прав. Роль власника не
 * змінюється цим шляхом: вона синхронізована з `Community.ownerId` і
 * міняється лише через передачу власності в {@link leaveCommunity}. */
export async function changeMemberRole(
  communityId: string,
  actorId: string,
  targetUserId: string,
  newRole: "admin" | "moderator" | "member",
): Promise<{ ok: true } | { ok: false; code: ChangeMemberRoleErrorCode }> {
  const actor = await findMembership(communityId, actorId);
  if (!actor || actor.status !== "approved") {
    return { ok: false, code: "not_found" };
  }

  if (actor.role !== "admin") {
    return { ok: false, code: "forbidden" };
  }

  const community = await prisma.community.findUniqueOrThrow({
    where: { id: communityId },
  });
  if (community.ownerId === targetUserId) {
    return { ok: false, code: "cannot_change_owner_role" };
  }

  const target = await findMembership(communityId, targetUserId);
  if (!target || target.status !== "approved") {
    return { ok: false, code: "target_not_member" };
  }

  if (target.role !== newRole) {
    await prisma.communityMember.update({
      where: { id: target.id },
      data: { role: newRole },
    });
  }

  return { ok: true };
}

export type RemoveMemberErrorCode =
  | "not_found"
  | "forbidden"
  | "target_not_member"
  | "cannot_remove_self"
  | "cannot_remove_owner";

/** `admin` видаляє будь-кого крім власника; `moderator` — лише `member`
 * (не інших moderator/admin). Самовидалення заборонене навмисно — для
 * цього є {@link leaveCommunity}, той самий підхід, що й у групових чатах
 * (lib/conversations.ts#removeGroupParticipant). */
export async function removeMember(
  communityId: string,
  actorId: string,
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; code: RemoveMemberErrorCode }> {
  const actor = await findMembership(communityId, actorId);
  if (!actor || actor.status !== "approved") {
    return { ok: false, code: "not_found" };
  }

  if (actor.role !== "admin" && actor.role !== "moderator") {
    return { ok: false, code: "forbidden" };
  }

  if (targetUserId === actorId) {
    return { ok: false, code: "cannot_remove_self" };
  }

  const community = await prisma.community.findUniqueOrThrow({
    where: { id: communityId },
  });
  if (community.ownerId === targetUserId) {
    return { ok: false, code: "cannot_remove_owner" };
  }

  const target = await findMembership(communityId, targetUserId);
  if (!target || target.status !== "approved") {
    return { ok: false, code: "target_not_member" };
  }

  if (actor.role === "moderator" && target.role !== "member") {
    return { ok: false, code: "forbidden" };
  }

  await prisma.communityMember.delete({ where: { id: target.id } });
  return { ok: true };
}

export interface CommunityMemberSummary {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "admin" | "moderator" | "member";
}

const memberSelect = {
  role: true,
  user: {
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  },
} as const;

function toMemberSummaries(
  rows: {
    role: "admin" | "moderator" | "member";
    user: Omit<CommunityMemberSummary, "role">;
  }[],
): CommunityMemberSummary[] {
  return rows.map((row) => ({ ...row.user, role: row.role }));
}

export interface CommunityDetail {
  id: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  ownerId: string;
  createdAt: Date;
  memberCount: number;
  /** `null` — приховано: `private`-спільнота, глядач не `approved`-учасник. */
  members: CommunityMemberSummary[] | null;
  viewerMembership: {
    role: "admin" | "moderator" | "member";
    status: "approved" | "pending";
  } | null;
  /** Заявки на вступ — заповнено лише для `admin`/`moderator`-глядача. */
  pendingRequests: CommunityMemberSummary[] | null;
}

/**
 * Деталі спільноти для GET /api/communities/:id. Спільнота видима всім
 * (навіть `private`, навіть неавторизованим) — це узгоджено з рішенням у
 * {@link joinCommunity}: подати заявку на вступ можна, лише знаючи, що
 * спільнота існує. Але список учасників `private`-спільноти бачать лише її
 * `approved`-учасники; заявки на розгляд — лише `admin`/`moderator`.
 */
export async function getCommunityDetail(
  communityId: string,
  viewerId: string | null,
): Promise<CommunityDetail | null> {
  const community = await prisma.community.findUnique({
    where: { id: communityId },
    include: {
      members: {
        where: { status: "approved" },
        orderBy: { joinedAt: "asc" },
        select: memberSelect,
      },
    },
  });
  if (!community) {
    return null;
  }

  const viewerRow = viewerId
    ? await findMembership(communityId, viewerId)
    : null;
  const viewerMembership = viewerRow
    ? { role: viewerRow.role, status: viewerRow.status }
    : null;

  const canSeeMembers =
    community.visibility === "public" ||
    viewerMembership?.status === "approved";

  const isModerator =
    viewerMembership?.status === "approved" &&
    (viewerMembership.role === "admin" ||
      viewerMembership.role === "moderator");

  let pendingRequests: CommunityMemberSummary[] | null = null;
  if (isModerator) {
    const pendingRows = await prisma.communityMember.findMany({
      where: { communityId, status: "pending" },
      orderBy: { joinedAt: "asc" },
      select: memberSelect,
    });
    pendingRequests = toMemberSummaries(pendingRows);
  }

  return {
    id: community.id,
    name: community.name,
    description: community.description,
    visibility: community.visibility,
    ownerId: community.ownerId,
    createdAt: community.createdAt,
    memberCount: community.members.length,
    members: canSeeMembers ? toMemberSummaries(community.members) : null,
    viewerMembership,
    pendingRequests,
  };
}

export interface CommunityListItem {
  id: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  memberCount: number;
}

const LIST_LIMIT = 20;

/**
 * Список/пошук для GET /api/communities. Порожній `query` — останні
 * створені; непорожній — фільтр за назвою (case-insensitive), той самий
 * підхід, що й у пошуку користувачів (lib/search-validation.ts). `private`-
 * спільноти теж у списку — сама назва не прихована (узгоджено з рішенням
 * у {@link joinCommunity}), лише вміст (учасники) прихований далі.
 */
export async function listCommunities(
  query: string | null,
): Promise<CommunityListItem[]> {
  const communities = await prisma.community.findMany({
    where: query ? { name: { contains: query, mode: "insensitive" } } : {},
    take: LIST_LIMIT,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { members: { where: { status: "approved" } } } },
    },
  });

  return communities.map((community) => ({
    id: community.id,
    name: community.name,
    description: community.description,
    visibility: community.visibility,
    memberCount: community._count.members,
  }));
}
