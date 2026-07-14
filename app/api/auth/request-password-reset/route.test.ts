import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { POST } from "./route";

const EMAIL = "password-reset-check@example.com";

function requestReset(email: string) {
  return POST(
    new Request("http://localhost/api/auth/request-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }),
  );
}

let userId: string;

beforeEach(async () => {
  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      username: "password_reset_check",
      passwordHash: await hashPassword("correct horse battery staple"),
    },
  });
  userId = user.id;
});

afterEach(async () => {
  await prisma.passwordResetToken.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe("POST /api/auth/request-password-reset", () => {
  it("returns success and creates a token for an existing email", async () => {
    const response = await requestReset(EMAIL);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const token = await prisma.passwordResetToken.findFirst({
      where: { userId },
    });
    expect(token).not.toBeNull();
    expect(token?.usedAt).toBeNull();
  });

  it("returns the identical success response for an unknown email", async () => {
    const response = await requestReset("no-such-account@example.com");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
  });

  it("does not create a token for an unknown email", async () => {
    await requestReset("no-such-account-either@example.com");

    // Scoped through the (nonexistent) user relation rather than a bare
    // findMany() — the table is shared with other test files running in
    // parallel against the same DB, an unscoped query would pick up their rows.
    const tokens = await prisma.passwordResetToken.findMany({
      where: { user: { email: "no-such-account-either@example.com" } },
    });
    expect(tokens).toHaveLength(0);
  });

  it("returns 400 validation_error for an invalid email", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 429 rate_limited after 3 requests for the same email", async () => {
    // Окремий, ніде більше в цьому файлі не використовуваний email — лічильник
    // rate-limit глобальний для процесу (lib/rate-limit.ts), спільний email з
    // іншими тестами дав би хибний результат через накопичений лічильник.
    const dedicatedEmail = "password-reset-ratelimit-only@example.com";

    for (let i = 0; i < 3; i++) {
      const response = await requestReset(dedicatedEmail);
      expect(response.status).toBe(200);
    }

    const response = await requestReset(dedicatedEmail);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error.code).toBe("rate_limited");
  });
});
