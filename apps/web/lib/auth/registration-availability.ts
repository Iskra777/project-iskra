import { prisma } from "@/lib/prisma";

export type AvailabilityResult =
  { ok: true } | { ok: false; code: "email_taken" | "username_taken" };

/**
 * Швидка попередня перевірка перед реєстрацією — не єдиний захист. Це
 * check-then-act: два одночасні запити з однаковим email/username теоретично
 * можуть обидва пройти цю перевірку до вставки в БД. Справжню гарантію дає
 * `@unique` на User.email/User.username — insert зловить P2002, якщо ця
 * перевірка пропустила гонку (реалізується разом зі створенням User у
 * наступній задачі).
 *
 * `email` очікується вже нормалізованим (нижній регістр) — це відповідальність
 * викликача через emailSchema (lib/auth/validation.ts), тут повторно не робиться.
 *
 * `username` — case-sensitive, без нормалізації. `TODO`: чи вважати "JohnDoe"
 * і "johndoe" одним і тим самим username — свідомо не вирішено в цій задачі
 * (назва задачі стосувалась лише email; username_taken реалізовано мінімально,
 * бо цього вимагає вже узгоджений контракт в API.md).
 */
export async function checkRegistrationAvailability(
  email: string,
  username: string,
): Promise<AvailabilityResult> {
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    return { ok: false, code: "email_taken" };
  }

  const existingUsername = await prisma.user.findUnique({
    where: { username },
  });
  if (existingUsername) {
    return { ok: false, code: "username_taken" };
  }

  return { ok: true };
}
