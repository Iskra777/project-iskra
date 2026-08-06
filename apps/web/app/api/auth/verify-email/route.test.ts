import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { createEmailVerificationToken } from "@/lib/auth/email-verification";
import { POST } from "./route";

const EMAIL = "verify-route-check@example.com";

function verify(body: unknown) {
  return POST(
    new Request("http://localhost/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

let userId: string;

beforeEach(async () => {
  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      username: "verify_route_check",
      passwordHash: await hashPassword("correct horse battery staple"),
    },
  });
  userId = user.id;
});

afterEach(async () => {
  await prisma.emailVerificationToken.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe("POST /api/auth/verify-email", () => {
  it("verifies the email and marks the token used", async () => {
    const token = await createEmailVerificationToken(userId);

    const response = await verify({ token });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.isEmailVerified).toBe(true);

    const record = await prisma.emailVerificationToken.findFirst({
      where: { userId },
    });
    expect(record?.usedAt).not.toBeNull();
  });

  it("rejects reusing an already-used token", async () => {
    const token = await createEmailVerificationToken(userId);
    await verify({ token });

    const response = await verify({ token });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_token");
  });

  it("rejects an expired token", async () => {
    const token = await createEmailVerificationToken(userId);
    await prisma.emailVerificationToken.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await verify({ token });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_token");
  });

  it("rejects an unknown token", async () => {
    const response = await verify({ token: "not-a-real-token" });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_token");
  });

  it("rejects a missing token", async () => {
    const response = await verify({});
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });
});
