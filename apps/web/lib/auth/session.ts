import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  REFRESH_TOKEN_TTL_SECONDS,
} from "./tokens";

// Швидкий криптографічний хеш, не argon2: це не пароль, який підбирають
// брутфорсом, лише спосіб не тримати сирий токен у базі.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface Session {
  accessToken: string;
  refreshToken: string;
}

export async function createSession(userId: string): Promise<Session> {
  const tokenId = randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
  const refreshToken = await signRefreshToken(userId, tokenId);

  await prisma.refreshToken.create({
    data: {
      id: tokenId,
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    },
  });

  const accessToken = await signAccessToken(userId);
  return { accessToken, refreshToken };
}

export type RefreshResult =
  { ok: true; session: Session } | { ok: false; code: "invalid_token" };

/** Ротація: старий запис відкликається, видається нова пара токенів.
 * Повторне використання вже відкликаного refresh-токена — сигнал
 * можливої крадіжки, тому теж повертає invalid_token. */
export async function refreshSession(
  refreshToken: string,
): Promise<RefreshResult> {
  let payload;
  try {
    payload = await verifyRefreshToken(refreshToken);
  } catch {
    return { ok: false, code: "invalid_token" };
  }

  const record = await prisma.refreshToken.findUnique({
    where: { id: payload.jti },
  });

  if (
    !record ||
    record.userId !== payload.sub ||
    record.revokedAt ||
    record.expiresAt < new Date() ||
    record.tokenHash !== hashToken(refreshToken)
  ) {
    return { ok: false, code: "invalid_token" };
  }

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });

  const session = await createSession(record.userId);
  return { ok: true, session };
}

/** Ідемпотентно: якщо токен уже невалідний/протермінований — інвалідувати
 * нічого, стан і так "не залогінений". Access-токен окремо не відкликається —
 * він короткоживий (15хв) і stateless за дизайном, blacklist для нього
 * не виправдовує додаткову інфраструктуру. */
export async function revokeSession(refreshToken: string): Promise<void> {
  let payload;
  try {
    payload = await verifyRefreshToken(refreshToken);
  } catch {
    return;
  }

  await prisma.refreshToken.updateMany({
    where: { id: payload.jti, userId: payload.sub, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
