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
