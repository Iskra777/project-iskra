import { randomBytes, createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { hashPassword } from "./password";

// Коротше за EmailVerificationToken (24 год) — скидання пароля чутливіше й
// терміновіше, коротше вікно для потенційного зловживання перехопленим листом.
const TOKEN_TTL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createPasswordResetToken(userId: string): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  return rawToken;
}

async function sendPasswordResetEmail(
  email: string,
  token: string,
): Promise<void> {
  const resetUrl = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;

  await sendEmail({
    to: email,
    subject: "Скидання пароля — Iskra",
    text: `Щоб встановити новий пароль, перейдіть за посиланням: ${resetUrl}\n\nПосилання дійсне 1 годину. Якщо це не ви — просто проігноруйте цей лист.`,
  });
}

/**
 * Завжди мовчазно завершується успішно з точки зору виклику — не повідомляє,
 * чи існує акаунт з таким email. Якщо користувача не знайдено, просто нічого
 * не робить (не генерує токен, не шле лист). Повна anti-enumeration стійкість
 * тут все одно недосяжна (реєстрація вже розкриває зайнятість email через
 * `email_taken`), але це все ще стандартна практика для цього конкретного
 * ендпоінта.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return;
  }

  const token = await createPasswordResetToken(user.id);
  await sendPasswordResetEmail(user.email, token);
}

export type ResetPasswordResult =
  { ok: true } | { ok: false; code: "invalid_token" };

/** "Вже використаний"/протермінований/невідомий токен — та сама відповідь
 * (invalid_token), як і у verify-email. Скидання пароля відкликає всі активні
 * RefreshToken користувача: скидання пароля часто трапляється саме через
 * підозру компрометації, і вкрадений раніше refresh-токен не повинен
 * продовжувати працювати після зміни пароля. */
export async function resetPassword(
  rawToken: string,
  newPassword: string,
): Promise<ResetPasswordResult> {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { ok: false, code: "invalid_token" };
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  return { ok: true };
}
