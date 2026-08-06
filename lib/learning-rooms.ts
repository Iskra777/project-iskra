import { prisma } from "@/lib/prisma";
import { authorSelect } from "@/lib/feed";

export interface LearningRoomHost {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface LearningRoom {
  id: string;
  hostId: string;
  title: string;
  description: string | null;
  learningPathId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toLearningRoom(room: {
  id: string;
  hostId: string;
  title: string;
  description: string | null;
  learningPathId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): LearningRoom {
  return {
    id: room.id,
    hostId: room.hostId,
    title: room.title,
    description: room.description,
    learningPathId: room.learningPathId,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

export interface CreateLearningRoomInput {
  title: string;
  description: string | null;
}

/** Хост одразу отримує `LearningRoomMember` — той самий підхід, що й
 * `createCommunity`/`createProject`. `learningPathId` не приймається тут —
 * немає способу через API створити валідний LearningPath (DATABASE.md →
 * LearningRoom → Рішення дизайну), поле лишається в схемі на майбутнє. */
export async function createLearningRoom(
  hostId: string,
  input: CreateLearningRoomInput,
): Promise<LearningRoom> {
  const room = await prisma.learningRoom.create({
    data: {
      hostId,
      title: input.title,
      description: input.description,
      members: {
        create: [{ userId: hostId }],
      },
    },
  });
  return toLearningRoom(room);
}

export type ListLearningRoomsErrorCode = "invalid_cursor";

export type ListLearningRoomsResult =
  | { ok: true; rooms: LearningRoom[]; nextCursor: string | null }
  | { ok: false; code: ListLearningRoomsErrorCode };

/** Публічний каталог — усі кімнати видимі всім авторизованим користувачам
 * (рішення дизайну: публічна й відкрита). Сортування за `createdAt`
 * спадаюче — звичайна стрічка, не календар, як у Event. */
export async function listLearningRooms(
  before: string | null,
  limit: number,
): Promise<ListLearningRoomsResult> {
  if (before) {
    const cursorRoom = await prisma.learningRoom.findUnique({
      where: { id: before },
    });
    if (!cursorRoom) return { ok: false, code: "invalid_cursor" };
  }

  const rooms = await prisma.learningRoom.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
  });

  const nextCursor = rooms.length === limit ? rooms[rooms.length - 1].id : null;

  return { ok: true, rooms: rooms.map(toLearningRoom), nextCursor };
}

export type LearningRoomErrorCode = "not_found";

export interface LearningRoomDetail extends LearningRoom {
  host: LearningRoomHost;
  viewerIsMember: boolean;
}

export type GetLearningRoomResult =
  | { ok: true; room: LearningRoomDetail }
  | { ok: false; code: LearningRoomErrorCode };

export async function getLearningRoom(
  roomId: string,
  viewerId: string,
): Promise<GetLearningRoomResult> {
  const room = await prisma.learningRoom.findUnique({
    where: { id: roomId },
    include: { host: { select: authorSelect } },
  });
  if (!room) return { ok: false, code: "not_found" };

  const membership = await prisma.learningRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId: viewerId } },
  });

  return {
    ok: true,
    room: {
      ...toLearningRoom(room),
      host: room.host,
      viewerIsMember: membership !== null,
    },
  };
}

export type MembershipResult =
  { ok: true } | { ok: false; code: LearningRoomErrorCode };

/** Ідемпотентне приєднання — `upsert` нічого не робить, якщо запис уже є
 * (той самий підхід, що й `setBookmark`). */
export async function joinLearningRoom(
  roomId: string,
  userId: string,
): Promise<MembershipResult> {
  const room = await prisma.learningRoom.findUnique({ where: { id: roomId } });
  if (!room) return { ok: false, code: "not_found" };

  await prisma.learningRoomMember.upsert({
    where: { roomId_userId: { roomId, userId } },
    create: { roomId, userId },
    update: {},
  });

  return { ok: true };
}

export type LeaveLearningRoomErrorCode = "not_found" | "host_cannot_leave";

export type LeaveLearningRoomResult =
  { ok: true } | { ok: false; code: LeaveLearningRoomErrorCode };

/** Хост не може вийти — немає передачі власності (той самий принцип, що й
 * `owner_cannot_leave` у Project); видалення кімнати — майбутня задача.
 * Ідемпотентне для решти — `deleteMany` не кидає помилку, якщо членства й
 * не було. */
export async function leaveLearningRoom(
  roomId: string,
  userId: string,
): Promise<LeaveLearningRoomResult> {
  const room = await prisma.learningRoom.findUnique({ where: { id: roomId } });
  if (!room) return { ok: false, code: "not_found" };
  if (room.hostId === userId) return { ok: false, code: "host_cannot_leave" };

  await prisma.learningRoomMember.deleteMany({ where: { roomId, userId } });

  return { ok: true };
}
