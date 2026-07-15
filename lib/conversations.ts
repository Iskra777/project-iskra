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
