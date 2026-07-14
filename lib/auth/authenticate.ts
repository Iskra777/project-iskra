import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "./password";

// Обчислюється один раз при старті процесу й використовується, коли email не
// знайдено, щоб час відповіді не видавав існування акаунта (timing side-channel).
// Без цього verifyPassword одразу повертав би false для невідомого email,
// а для існуючого — після повного обрахунку argon2id, і різниця в часі сама
// стала б enumeration-вектором навіть при однаковому тілі відповіді (API.md).
const dummyHash = hashPassword("timing-attack-mitigation-placeholder");

export interface SafeUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
}

export type AuthenticateResult =
  | { ok: true; user: SafeUser }
  | {
      ok: false;
      code:
        "invalid_credentials" | "email_not_verified" | "account_deactivated";
    };

/**
 * Пошук за email — точне співпадіння (case-sensitive у Postgres). Це безпечно,
 * бо і login (app/api/auth/login/route.ts), і майбутня реєстрація нормалізують
 * email через emailSchema (lib/auth/validation.ts) до нижнього регістру перед
 * тим, як він сюди потрапляє — саме тут закрито колишній TODO про регістр.
 */
export async function authenticateUser(
  email: string,
  password: string,
): Promise<AuthenticateResult> {
  const user = await prisma.user.findUnique({ where: { email } });

  const passwordValid = await verifyPassword(
    user?.passwordHash ?? (await dummyHash),
    password,
  );

  if (!user || !passwordValid) {
    return { ok: false, code: "invalid_credentials" };
  }

  if (user.deletedAt || !user.isActive) {
    return { ok: false, code: "account_deactivated" };
  }

  if (!user.isEmailVerified) {
    return { ok: false, code: "email_not_verified" };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
    },
  };
}
