import { prisma } from "@/lib/prisma";

export type CreateDirectConversationResult =
  | { ok: true; conversationId: string; created: boolean }
  | { ok: false; code: "cannot_message_self" | "blocked" };

/**
 * Знаходить наявну `direct`-розмову між двома людьми, або створює нову.
 * Пошук дублікатів — на рівні застосунку, за задокументованим у
 * DATABASE.md#conversation підходом (перетин участі по conversation_id).
 */
export async function createDirectConversation(
  userId: string,
  otherUserId: string,
): Promise<CreateDirectConversationResult> {
  if (userId === otherUserId) {
    return { ok: false, code: "cannot_message_self" };
  }

  const blockedRelationship = await prisma.friendship.findFirst({
    where: {
      status: "blocked",
      OR: [
        { requesterId: userId, addresseeId: otherUserId },
        { requesterId: otherUserId, addresseeId: userId },
      ],
    },
  });
  if (blockedRelationship) {
    return { ok: false, code: "blocked" };
  }

  const existing = await prisma.conversation.findFirst({
    where: {
      type: "direct",
      AND: [
        { participants: { some: { userId } } },
        { participants: { some: { userId: otherUserId } } },
      ],
    },
  });

  if (existing) {
    return { ok: true, conversationId: existing.id, created: false };
  }

  const conversation = await prisma.conversation.create({
    data: {
      type: "direct",
      participants: {
        create: [{ userId }, { userId: otherUserId }],
      },
    },
  });

  return { ok: true, conversationId: conversation.id, created: true };
}

/** Використовується і для надсилання, і для читання історії — той самий
 * рядок потрібен в обох місцях (участь + lastReadAt). */
export function findParticipant(conversationId: string, userId: string) {
  return prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
}

/** Творець одразу `admin`, решта — `member` (DATABASE.md#conversation).
 * Мінімум учасників (2 запрошених) перевіряє викликач (zod-схема
 * ендпоінта) — тут лише сам факт створення. */
export async function createGroupConversation(
  creatorId: string,
  title: string,
  memberIds: string[],
): Promise<{ conversationId: string }> {
  const conversation = await prisma.conversation.create({
    data: {
      type: "group",
      title,
      participants: {
        create: [
          { userId: creatorId, role: "admin" },
          ...memberIds.map((userId) => ({ userId, role: "member" as const })),
        ],
      },
    },
  });

  return { conversationId: conversation.id };
}

export type GroupParticipantsErrorCode =
  "not_found" | "not_a_group" | "forbidden";

/**
 * Лише `admin` групи може додавати учасників. Уже наявних учасників
 * тихо пропускає (ідемпотентно) замість помилки — додавання когось,
 * хто вже в групі, не мало б ламати весь запит.
 */
export async function addGroupParticipants(
  conversationId: string,
  actorId: string,
  newUserIds: string[],
): Promise<{ ok: true } | { ok: false; code: GroupParticipantsErrorCode }> {
  const check = await checkGroupAdmin(conversationId, actorId);
  if (!check.ok) return check;

  const existing = await prisma.conversationParticipant.findMany({
    where: { conversationId, userId: { in: newUserIds } },
    select: { userId: true },
  });
  const existingIds = new Set(existing.map((p) => p.userId));
  const toAdd = newUserIds.filter((id) => !existingIds.has(id));

  if (toAdd.length > 0) {
    await prisma.conversationParticipant.createMany({
      data: toAdd.map((userId) => ({ conversationId, userId, role: "member" })),
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  }

  return { ok: true };
}

export type RemoveParticipantErrorCode =
  GroupParticipantsErrorCode | "cannot_remove_self" | "not_participant";

/**
 * Лише `admin` може видаляти учасників, і не себе — вихід з групи це
 * окрема майбутня задача плану ("вихід з групи і передача прав адміна"),
 * не змішую з кік-логікою тут.
 */
export async function removeGroupParticipant(
  conversationId: string,
  actorId: string,
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; code: RemoveParticipantErrorCode }> {
  const check = await checkGroupAdmin(conversationId, actorId);
  if (!check.ok) return check;

  if (targetUserId === actorId) {
    return { ok: false, code: "cannot_remove_self" };
  }

  const target = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: targetUserId } },
  });
  if (!target) {
    return { ok: false, code: "not_participant" };
  }

  await prisma.conversationParticipant.delete({ where: { id: target.id } });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return { ok: true };
}

export type TransferAdminErrorCode =
  GroupParticipantsErrorCode | "not_participant";

/** Призначає учасника додатковим `admin` — не забирає права в того, хто
 * призначає (декілька admin одночасно дозволені, DATABASE.md#груповий-формат).
 * Ідемпотентно: якщо ціль уже admin, просто нічого не робить. */
export async function transferGroupAdmin(
  conversationId: string,
  actorId: string,
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; code: TransferAdminErrorCode }> {
  const check = await checkGroupAdmin(conversationId, actorId);
  if (!check.ok) return check;

  const target = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: targetUserId } },
  });
  if (!target) {
    return { ok: false, code: "not_participant" };
  }

  if (target.role !== "admin") {
    await prisma.conversationParticipant.update({
      where: { id: target.id },
      data: { role: "admin" },
    });
  }

  return { ok: true };
}

export type LeaveGroupErrorCode =
  "not_found" | "not_a_group" | "admin_required" | "invalid_new_admin";

/**
 * Вихід із групи. Якщо той, хто виходить, — єдиний `admin`, і в групі
 * лишаються інші учасники, вихід без `newAdminUserId` заборонено
 * (`admin_required`) — свідомо не авто-призначаємо "наступного за
 * joinedAt", щоб не було magic-вибору, якого ніхто не просив.
 */
export async function leaveGroup(
  conversationId: string,
  userId: string,
  newAdminUserId?: string,
): Promise<{ ok: true } | { ok: false; code: LeaveGroupErrorCode }> {
  const participant = await findParticipant(conversationId, userId);
  if (!participant) {
    return { ok: false, code: "not_found" };
  }

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { type: true },
  });
  if (conversation.type !== "group") {
    return { ok: false, code: "not_a_group" };
  }

  const allParticipants = await prisma.conversationParticipant.findMany({
    where: { conversationId },
  });
  const remaining = allParticipants.filter((p) => p.userId !== userId);
  const isOnlyAdmin =
    participant.role === "admin" && !remaining.some((p) => p.role === "admin");

  if (isOnlyAdmin && remaining.length > 0) {
    if (!newAdminUserId) {
      return { ok: false, code: "admin_required" };
    }
    const target = remaining.find((p) => p.userId === newAdminUserId);
    if (!target) {
      return { ok: false, code: "invalid_new_admin" };
    }
    await prisma.conversationParticipant.update({
      where: { id: target.id },
      data: { role: "admin" },
    });
  }

  await prisma.conversationParticipant.delete({
    where: { id: participant.id },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return { ok: true };
}

async function checkGroupAdmin(
  conversationId: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; code: GroupParticipantsErrorCode }> {
  const actor = await findParticipant(conversationId, actorId);
  if (!actor) {
    return { ok: false, code: "not_found" };
  }

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: { type: true },
  });
  if (conversation.type !== "group") {
    return { ok: false, code: "not_a_group" };
  }

  if (actor.role !== "admin") {
    return { ok: false, code: "forbidden" };
  }

  return { ok: true };
}

export interface ParticipantSummary {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
}

const participantSelect = {
  role: true,
  user: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  },
} as const;

function toParticipantSummaries(
  participants: { role: string; user: Omit<ParticipantSummary, "role"> }[],
): ParticipantSummary[] {
  return participants.map((p) => ({ ...p.user, role: p.role }));
}

export interface ConversationListItem {
  id: string;
  type: string;
  title: string | null;
  /** Лише для `direct` — "той самий" список у `participants`, зручний
   * ярлик для найпоширенішого випадку (1:1 чат). `null` для `group`. */
  otherParticipant: ParticipantSummary | null;
  participants: ParticipantSummary[];
  lastMessage: {
    id: string;
    content: string;
    senderId: string;
    sentAt: Date;
  } | null;
  unread: boolean;
}

/**
 * Inbox для GET /api/conversations, відсортований за активністю
 * (Conversation.updatedAt, оновлюється при кожному новому повідомленні).
 */
export async function listConversations(
  userId: string,
): Promise<ConversationListItem[]> {
  const rows = await prisma.conversationParticipant.findMany({
    where: { userId },
    orderBy: { conversation: { updatedAt: "desc" } },
    include: {
      conversation: {
        include: {
          participants: {
            select: participantSelect,
            orderBy: { joinedAt: "asc" },
          },
          messages: {
            where: { deletedAt: null },
            orderBy: { sentAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  return rows.map((row) => {
    const { conversation } = row;
    const participants = toParticipantSummaries(conversation.participants);
    const otherParticipant =
      conversation.type === "direct"
        ? (participants.find((p) => p.id !== userId) ?? null)
        : null;
    const lastMessage = conversation.messages[0] ?? null;
    const unread =
      lastMessage !== null &&
      lastMessage.senderId !== userId &&
      (!row.lastReadAt || lastMessage.sentAt > row.lastReadAt);

    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      otherParticipant,
      participants,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            content: lastMessage.content,
            senderId: lastMessage.senderId,
            sentAt: lastMessage.sentAt,
          }
        : null,
      unread,
    };
  });
}

export interface ConversationDetail {
  id: string;
  type: string;
  title: string | null;
  otherParticipant: ParticipantSummary | null;
  participants: ParticipantSummary[];
}

/** Метадані для GET /api/conversations/:id — заголовок екрана чату
 * (з ким / яка група), незалежно від того, чи це `direct`, чи `group`. */
export async function getConversationDetail(
  conversationId: string,
  userId: string,
): Promise<ConversationDetail> {
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: {
      participants: {
        select: participantSelect,
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  const participants = toParticipantSummaries(conversation.participants);
  const otherParticipant =
    conversation.type === "direct"
      ? (participants.find((p) => p.id !== userId) ?? null)
      : null;

  return {
    id: conversation.id,
    type: conversation.type,
    title: conversation.title,
    otherParticipant,
    participants,
  };
}
