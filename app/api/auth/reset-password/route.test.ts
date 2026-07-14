import "dotenv/config";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { requestPasswordReset } from "@/lib/auth/password-reset";
import { POST } from "./route";

const EMAIL = "reset-route-check@example.com";
const OLD_PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "new correct horse battery staple";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function resetPasswordRequest(token: string, password: string) {
  return POST(
    new Request("http://localhost/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    }),
  );
}

async function createResetToken(userId: string): Promise<string> {
  const rawToken = `test-reset-token-${userId}`;
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return rawToken;
}

let userId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      username: "reset_route_check",
      passwordHash: await hashPassword(OLD_PASSWORD),
    },
  });
  userId = user.id;
});

afterEach(async () => {
  await prisma.passwordResetToken.deleteMany({ where: { userId } });
  await prisma.refreshToken.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe("POST /api/auth/reset-password", () => {
  it("resets the password and revokes active sessions", async () => {
    const token = await createResetToken(userId);
    await createSession(userId);

    const activeBefore = await prisma.refreshToken.count({
      where: { userId, revokedAt: null },
    });
    expect(activeBefore).toBe(1);

    const response = await resetPasswordRequest(token, NEW_PASSWORD);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(await verifyPassword(user!.passwordHash, NEW_PASSWORD)).toBe(true);
    expect(await verifyPassword(user!.passwordHash, OLD_PASSWORD)).toBe(false);

    const activeAfter = await prisma.refreshToken.count({
      where: { userId, revokedAt: null },
    });
    expect(activeAfter).toBe(0);
  });

  it("rejects reusing an already-used token", async () => {
    const token = await createResetToken(userId);
    await resetPasswordRequest(token, NEW_PASSWORD);

    const response = await resetPasswordRequest(token, "another password");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_token");
  });

  it("rejects an unknown token", async () => {
    const response = await resetPasswordRequest("no-such-token", NEW_PASSWORD);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_token");
  });

  it("returns 400 weak_password for a too-short password", async () => {
    const response = await resetPasswordRequest("whatever-token", "short");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("weak_password");
  });

  it("returns 400 validation_error for a missing token", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: NEW_PASSWORD }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("works end to end with requestPasswordReset's token", async () => {
    await requestPasswordReset(EMAIL);
    const record = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId },
    });

    // requestPasswordReset шле лист із сирим токеном, тут доступний лише
    // хеш — підміняємо хеш на контрольований токен, щоб перевірити, що
    // resetPassword реально працює з записом, який створює цей flow.
    const controlledToken = "controlled-e2e-token";
    await prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { tokenHash: hashToken(controlledToken) },
    });

    const response = await resetPasswordRequest(controlledToken, NEW_PASSWORD);
    expect(response.status).toBe(200);
  });
});
