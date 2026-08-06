import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { POST } from "./route";

const PREFIX = "auth_refresh_";

function refreshWithCookie(refreshToken: string, headers: HeadersInit = {}) {
  return POST(
    new Request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { cookie: `refresh_token=${refreshToken}`, ...headers },
    }),
  );
}

function refreshWithHeader(refreshToken: string) {
  return POST(
    new Request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { "X-Client": "mobile", "X-Refresh-Token": refreshToken },
    }),
  );
}

let userId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const user = await prisma.user.create({
    data: {
      email: `${PREFIX}user@example.com`,
      username: `${PREFIX}user`,
      passwordHash,
    },
  });
  userId = user.id;
});

afterEach(async () => {
  await prisma.refreshToken.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe("POST /api/auth/refresh", () => {
  it("rotates the session via cookie and returns a new accessToken", async () => {
    const session = await createSession(userId);
    const response = await refreshWithCookie(session.refreshToken);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.accessToken).toBe("string");
    expect(body.refreshToken).toBeUndefined();
    expect(response.headers.get("set-cookie")).toContain("refresh_token=");
  });

  it("accepts X-Refresh-Token header and returns refreshToken in body for mobile", async () => {
    const session = await createSession(userId);
    const response = await refreshWithHeader(session.refreshToken);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.accessToken).toBe("string");
    expect(typeof body.refreshToken).toBe("string");
    expect(body.refreshToken).not.toBe(session.refreshToken);
  });

  it("prefers the cookie over the header when both are present", async () => {
    const cookieSession = await createSession(userId);
    const response = await refreshWithCookie(cookieSession.refreshToken, {
      "X-Refresh-Token": "not-a-real-token",
    });

    expect(response.status).toBe(200);
  });

  it("rejects a revoked (already-rotated) refresh token", async () => {
    const session = await createSession(userId);
    await refreshWithCookie(session.refreshToken);

    const response = await refreshWithCookie(session.refreshToken);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });

  it("returns 401 invalid_token without a cookie or header", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/refresh", { method: "POST" }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
