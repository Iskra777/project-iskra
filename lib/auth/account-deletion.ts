import { prisma } from "@/lib/prisma";
import { verifyPassword } from "./password";

export type DeleteAccountResult =
  { ok: true } | { ok: false; code: "invalid_credentials" };

/**
 * Повторна автентифікація перед деструктивною дією — access-токен сам
 * по собі не є достатнім підтвердженням, якщо його вкрадено/лишено
 * відкритим на чужому пристрої. Той самий принцип, що й resetPassword:
 * soft-delete (`deletedAt`) + відкликання всіх RefreshToken.
 */
export async function deleteAccount(
  userId: string,
  password: string,
): Promise<DeleteAccountResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { ok: false, code: "invalid_credentials" };
  }

  const passwordValid = await verifyPassword(user.passwordHash, password);
  if (!passwordValid) {
    return { ok: false, code: "invalid_credentials" };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: { userId, actorId: userId, action: "account_deletion_requested" },
    }),
  ]);

  return { ok: true };
}
