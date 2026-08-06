import { prisma } from "@/lib/prisma";

export interface Material {
  id: string;
  roomId: string;
  addedById: string;
  title: string;
  url: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toMaterial(material: {
  id: string;
  roomId: string;
  addedById: string;
  title: string;
  url: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Material {
  return {
    id: material.id,
    roomId: material.roomId,
    addedById: material.addedById,
    title: material.title,
    url: material.url,
    note: material.note,
    createdAt: material.createdAt,
    updatedAt: material.updatedAt,
  };
}

export interface AddMaterialInput {
  title: string;
  url: string;
  note: string | null;
}

export type AddMaterialErrorCode = "not_found" | "forbidden";

export type AddMaterialResult =
  { ok: true; material: Material } | { ok: false; code: AddMaterialErrorCode };

/** Додавати може будь-який учасник кімнати, не лише хост — crowdsourced
 * список ресурсів (DATABASE.md → Material → Права). Кімната публічна, тож
 * "не учасник" дає `forbidden`, не anti-enumeration `not_found`. */
export async function addMaterial(
  roomId: string,
  actorId: string,
  input: AddMaterialInput,
): Promise<AddMaterialResult> {
  const room = await prisma.learningRoom.findUnique({ where: { id: roomId } });
  if (!room) return { ok: false, code: "not_found" };

  const membership = await prisma.learningRoomMember.findUnique({
    where: { roomId_userId: { roomId, userId: actorId } },
  });
  if (!membership) return { ok: false, code: "forbidden" };

  const material = await prisma.material.create({
    data: {
      roomId,
      addedById: actorId,
      title: input.title,
      url: input.url,
      note: input.note,
    },
  });

  return { ok: true, material: toMaterial(material) };
}

export type ListMaterialsErrorCode = "not_found";

export type ListMaterialsResult =
  | { ok: true; materials: Material[] }
  | { ok: false; code: ListMaterialsErrorCode };

/** Публічний перегляд — без перевірки членства, той самий рівень
 * видимості, що й сама кімната. */
export async function listMaterials(
  roomId: string,
): Promise<ListMaterialsResult> {
  const room = await prisma.learningRoom.findUnique({ where: { id: roomId } });
  if (!room) return { ok: false, code: "not_found" };

  const materials = await prisma.material.findMany({
    where: { roomId },
    orderBy: { createdAt: "desc" },
  });

  return { ok: true, materials: materials.map(toMaterial) };
}

export type MaterialMutationErrorCode = "not_found" | "forbidden";

export interface EditMaterialInput {
  title?: string;
  url?: string;
  note?: string | null;
}

export type EditMaterialResult =
  | { ok: true; material: Material }
  | { ok: false; code: MaterialMutationErrorCode };

async function findMaterialWithRoom(materialId: string) {
  return prisma.material.findUnique({
    where: { id: materialId },
    include: { room: true },
  });
}

/** Редагувати може лише автор запису або хост кімнати (модерація) —
 * DATABASE.md → Material → Права. */
export async function editMaterial(
  materialId: string,
  actorId: string,
  input: EditMaterialInput,
): Promise<EditMaterialResult> {
  const existing = await findMaterialWithRoom(materialId);
  if (!existing) return { ok: false, code: "not_found" };
  if (existing.addedById !== actorId && existing.room.hostId !== actorId) {
    return { ok: false, code: "forbidden" };
  }

  const material = await prisma.material.update({
    where: { id: materialId },
    data: input,
  });

  return { ok: true, material: toMaterial(material) };
}

export type DeleteMaterialResult =
  { ok: true } | { ok: false; code: MaterialMutationErrorCode };

export async function deleteMaterial(
  materialId: string,
  actorId: string,
): Promise<DeleteMaterialResult> {
  const existing = await findMaterialWithRoom(materialId);
  if (!existing) return { ok: false, code: "not_found" };
  if (existing.addedById !== actorId && existing.room.hostId !== actorId) {
    return { ok: false, code: "forbidden" };
  }

  await prisma.material.delete({ where: { id: materialId } });

  return { ok: true };
}
