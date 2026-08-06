import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { POST } from "./route";

const PASSWORD = "correct horse battery staple";

const EMAILS = {
  success: "route-test-success@example.com",
  wrongPassword: "route-test-wrongpass@example.com",
  deactivated: "route-test-deactivated@example.com",
  unverified: "route-test-unverified@example.com",
  unknown: "route-test-unknown@example.com",
  rateLimit: "route-test-ratelimit@example.com",
};

function login(email: string, password: string) {
  return POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
}

beforeAll(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

  const passwordHash = await hashPassword(PASSWORD);
  await prisma.user.createMany({
    data: [
      {
        email: EMAILS.success,
        username: "route-test-success",
        passwordHash,
        isEmailVerified: true,
      },
      {
        email: EMAILS.wrongPassword,
        username: "route-test-wrongpass",
        passwordHash,
        isEmailVerified: true,
      },
      {
        email: EMAILS.deactivated,
        username: "route-test-deactivated",
        passwordHash,
        isEmailVerified: true,
        isActive: false,
      },
      {
        email: EMAILS.unverified,
        username: "route-test-unverified",
        passwordHash,
        isEmailVerified: false,
      },
      {
        email: EMAILS.rateLimit,
        username: "route-test-ratelimit",
        passwordHash,
        isEmailVerified: true,
      },
    ],
  });
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(EMAILS) } },
  });
  const userIds = users.map((user) => user.id);
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("POST /api/auth/login", () => {
  it("returns 200 with user and accessToken on correct credentials", async () => {
    const response = await login(EMAILS.success, PASSWORD);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.email).toBe(EMAILS.success);
    expect(body.user.passwordHash).toBeUndefined();
    expect(typeof body.accessToken).toBe("string");
    expect(response.headers.get("set-cookie")).toContain("refresh_token=");
  });

  it("logs in successfully when email casing differs from what's stored", async () => {
    const differentCase = EMAILS.success.toUpperCase();
    const response = await login(differentCase, PASSWORD);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.email).toBe(EMAILS.success);
  });

  it("returns 401 invalid_credentials on wrong password", async () => {
    const response = await login(EMAILS.wrongPassword, "wrong password");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_credentials");
  });

  it("returns 401 invalid_credentials on unknown email (same as wrong password)", async () => {
    const response = await login(EMAILS.unknown, "whatever");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_credentials");
  });

  it("returns 403 account_deactivated for a deactivated account", async () => {
    const response = await login(EMAILS.deactivated, PASSWORD);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("account_deactivated");
  });

  it("returns 403 email_not_verified for an unverified account", async () => {
    const response = await login(EMAILS.unverified, PASSWORD);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("email_not_verified");
  });

  it("returns 400 validation_error on a malformed body", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 429 rate_limited after 5 failed attempts on the same email", async () => {
    for (let i = 0; i < 5; i++) {
      const response = await login(EMAILS.rateLimit, "wrong password");
      expect(response.status).toBe(401);
    }

    const response = await login(EMAILS.rateLimit, "wrong password");
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error.code).toBe("rate_limited");
    expect(response.headers.get("retry-after")).toBeTruthy();
  });
});
