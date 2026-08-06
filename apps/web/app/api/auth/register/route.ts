import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  emailSchema,
  usernameSchema,
  passwordSchema,
} from "@/lib/auth/validation";
import { checkRegistrationAvailability } from "@/lib/auth/registration-availability";
import { hashPassword } from "@/lib/auth/password";
import {
  createEmailVerificationToken,
  sendVerificationEmail,
} from "@/lib/auth/email-verification";

const CONSENT_TYPE = "terms_of_service";
const CONSENT_VERSION = "1.0";

const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(100).nullable().optional(),
  consent: z.literal(true),
});

function errorResponse(
  code: string,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

function toSafeUser(user: {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    const paths = parsed.error.issues.map((issue) => issue.path[0]);
    const onlyPasswordFailed =
      paths.length > 0 && paths.every((path) => path === "password");

    if (onlyPasswordFailed) {
      return errorResponse(
        "weak_password",
        "Пароль має містити від 8 до 128 символів.",
        400,
      );
    }
    return errorResponse(
      "validation_error",
      "Перевірте правильність введених даних.",
      400,
    );
  }

  const { email, username, password, displayName } = parsed.data;

  const availability = await checkRegistrationAvailability(email, username);
  if (!availability.ok) {
    const messages: Record<typeof availability.code, string> = {
      email_taken: "Цей email вже зареєстровано.",
      username_taken: "Цей username вже зайнятий.",
    };
    return errorResponse(availability.code, messages[availability.code], 409);
  }

  const passwordHash = await hashPassword(password);

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        displayName: displayName ?? null,
      },
    });
  } catch (error) {
    // Backstop проти гонки (checkRegistrationAvailability — check-then-act,
    // див. lib/auth/registration-availability.ts): @unique у БД зловив
    // дублікат, якого перевірка вище пропустила.
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return errorResponse(
        "email_taken",
        "Цей email або username вже зайнято.",
        409,
      );
    }
    throw error;
  }

  await prisma.consentRecord.create({
    data: {
      userId: user.id,
      consentType: CONSENT_TYPE,
      version: CONSENT_VERSION,
      grantedAt: new Date(),
    },
  });

  const verificationToken = await createEmailVerificationToken(user.id);
  await sendVerificationEmail(user.email, verificationToken);

  return NextResponse.json({ user: toSafeUser(user) }, { status: 201 });
}
