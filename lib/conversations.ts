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

export interface ConversationListItem {
  id: string;
  type: string;
  otherParticipant: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
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
 * Лише `direct` розмови мають сенс для `otherParticipant` — групові чати
 * (наступна задача плану) розширять цю функцію пізніше.
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
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatarUrl: true,
                },
              },
            },
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
    const otherParticipant =
      conversation.type === "direct"
        ? (conversation.participants.find((p) => p.userId !== userId)?.user ??
          null)
        : null;
    const lastMessage = conversation.messages[0] ?? null;
    const unread =
      lastMessage !== null &&
      lastMessage.senderId !== userId &&
      (!row.lastReadAt || lastMessage.sentAt > row.lastReadAt);

    return {
      id: conversation.id,
      type: conversation.type,
      otherParticipant,
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
