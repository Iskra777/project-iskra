import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken, signRefreshToken } from "@/lib/auth/tokens";
import { PATCH, DELETE } from "./route";

const EMAIL = "update-profile-check@example.com";
const PASSWORD = "correct horse battery staple";

function updateProfile(body: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return PATCH(
    new Request("http://localhost/api/users/me", {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

function deleteAccountRequest(body: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return DELETE(
    new Request("http://localhost/api/users/me", {
      method: "DELETE",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

let userId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      username: "update_profile_check",
      passwordHash: await hashPassword(PASSWORD),
      bio: "old bio",
      location: "old location",
    },
  });
  userId = user.id;
});

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { userId } });
  await prisma.refreshToken.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe("PATCH /api/users/me", () => {
  it("updates the provided fields", async () => {
    const token = await signAccessToken(userId);
    const response = await updateProfile(
      { displayName: "New Name", location: "Kyiv" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.displayName).toBe("New Name");
    expect(body.user.location).toBe("Kyiv");
    expect(body.user.bio).toBe("old bio"); // не чіпали — лишилось
  });

  it("clears a field when explicitly set to null", async () => {
    const token = await signAccessToken(userId);
    const response = await updateProfile({ bio: null }, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.bio).toBeNull();
    expect(body.user.location).toBe("old location"); // не чіпали — лишилось
  });

  it("returns 401 without a token", async () => {
    const response = await updateProfile({ bio: "hi" });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });

  it("returns 400 validation_error when a field exceeds its length limit", async () => {
    const token = await signAccessToken(userId);
    const response = await updateProfile({ bio: "a".repeat(501) }, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("does not allow updating email or username", async () => {
    const token = await signAccessToken(userId);
    const response = await updateProfile(
      { email: "hacked@example.com", username: "hacked" },
      token,
    );
    const body = await response.json();

    // Зайві поля просто ігноруються zod-схемою (не описані в updateProfileSchema).
    expect(response.status).toBe(200);
    expect(body.user.email).toBe(EMAIL);
    expect(body.user.username).toBe("update_profile_check");
  });
});

describe("DELETE /api/users/me", () => {
  it("soft-deletes the account, revokes sessions, and logs the request", async () => {
    const token = await signAccessToken(userId);
    const sessionId = crypto.randomUUID();
    const refreshToken = await signRefreshToken(userId, sessionId);
    await prisma.refreshToken.create({
      data: {
        id: sessionId,
        userId,
        tokenHash: refreshToken,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });

    const response = await deleteAccountRequest({ password: PASSWORD }, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.deletedAt).not.toBeNull();

    const session = await prisma.refreshToken.findUnique({
      where: { id: sessionId },
    });
    expect(session?.revokedAt).not.toBeNull();

    const auditLog = await prisma.auditLog.findFirst({
      where: { userId, action: "account_deletion_requested" },
    });
    expect(auditLog).not.toBeNull();

    expect(response.headers.get("set-cookie")).toContain("refresh_token=;");
  });

  it("returns 401 without a token", async () => {
    const response = await deleteAccountRequest({ password: PASSWORD });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });

  it("returns 400 validation_error when password is missing", async () => {
    const token = await signAccessToken(userId);
    const response = await deleteAccountRequest({}, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 invalid_credentials on wrong password, without deleting the account", async () => {
    const token = await signAccessToken(userId);
    const response = await deleteAccountRequest(
      { password: "wrong password" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_credentials");

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.deletedAt).toBeNull();
  });
});
