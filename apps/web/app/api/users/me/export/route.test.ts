import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { GET } from "./route";

const EMAIL = "export-data-check@example.com";

function exportData(accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(new Request("http://localhost/api/users/me/export", { headers }));
}

let userId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      username: "export_data_check",
      passwordHash: await hashPassword("correct horse battery staple"),
      bio: "some bio",
    },
  });
  userId = user.id;
});

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe("GET /api/users/me/export", () => {
  it("returns the full own profile and logs the request", async () => {
    const token = await signAccessToken(userId);
    const response = await exportData(token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.email).toBe(EMAIL);
    expect(body.user.bio).toBe("some bio");
    expect(body.exportedAt).toBeDefined();
    expect(response.headers.get("content-disposition")).toContain("attachment");

    const auditLog = await prisma.auditLog.findFirst({
      where: { userId, action: "data_export_requested" },
    });
    expect(auditLog).not.toBeNull();
  });

  it("returns 401 without a token", async () => {
    const response = await exportData();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
