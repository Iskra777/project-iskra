import { randomBytes, createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Швидкий криптографічний хеш, не argon2 — той самий підхід, що й для
// RefreshToken (lib/auth/session.ts): це не пароль, а опаковий випадковий
// токен, повільна KDF тут не потрібна.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createEmailVerificationToken(
  userId: string,
): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");

  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  return rawToken;
}

export async function sendVerificationEmail(
  email: string,
  token: string,
): Promise<void> {
  const verifyUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/verify-email?token=${token}`;

  await sendEmail({
    to: email,
    subject: "Підтвердіть email — Iskra",
    text: `Щоб підтвердити email, перейдіть за посиланням: ${verifyUrl}\n\nПосилання дійсне 24 години.`,
  });
}
