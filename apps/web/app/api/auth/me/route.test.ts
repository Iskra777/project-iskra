import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { GET } from "./route";

const EMAIL = "me-route-check@example.com";

function getMe(accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(new Request("http://localhost/api/auth/me", { headers }));
}

let userId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      username: "me_route_check",
      passwordHash: await hashPassword("correct horse battery staple"),
      bio: "hello",
    },
  });
  userId = user.id;
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe("GET /api/auth/me", () => {
  it("returns the full profile for a valid token", async () => {
    const token = await signAccessToken(userId);
    const response = await getMe(token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.email).toBe(EMAIL);
    expect(body.user.bio).toBe("hello");
  });

  it("returns 401 invalid_token without an Authorization header", async () => {
    const response = await getMe();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });

  it("returns 401 invalid_token for a garbage token", async () => {
    const response = await getMe("not-a-real-token");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });

  it("returns 401 invalid_token for a deactivated account", async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });
    const token = await signAccessToken(userId);

    const response = await getMe(token);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
