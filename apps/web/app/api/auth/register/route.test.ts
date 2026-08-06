import "dotenv/config";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { POST } from "./route";

const PASSWORD = "correct horse battery staple";
const EXISTING_EMAIL = "register-route-existing@example.com";
const EXISTING_USERNAME = "reg_route_exist";

function register(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function cleanupUser(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  await prisma.emailVerificationToken.deleteMany({
    where: { userId: user.id },
  });
  await prisma.consentRecord.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

beforeAll(async () => {
  await prisma.user.create({
    data: {
      email: EXISTING_EMAIL,
      username: EXISTING_USERNAME,
      passwordHash: await hashPassword(PASSWORD),
    },
  });
});

afterAll(async () => {
  await cleanupUser(EXISTING_EMAIL);
});

describe("POST /api/auth/register", () => {
  afterEach(async () => {
    await cleanupUser("route-test-register-success@example.com");
  });

  it("returns 201, creates the user, a ConsentRecord, and an EmailVerificationToken", async () => {
    const email = "route-test-register-success@example.com";
    const response = await register({
      email,
      username: "route_test_register",
      password: PASSWORD,
      consent: true,
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.user.email).toBe(email);
    expect(body.user.passwordHash).toBeUndefined();

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    expect(user?.isEmailVerified).toBe(false);

    const consent = await prisma.consentRecord.findFirst({
      where: { userId: user!.id },
    });
    expect(consent?.consentType).toBe("terms_of_service");

    const token = await prisma.emailVerificationToken.findFirst({
      where: { userId: user!.id },
    });
    expect(token).not.toBeNull();
    expect(token?.usedAt).toBeNull();
  });

  it("normalizes email casing on registration", async () => {
    const response = await register({
      email: "Route-Test-Register-Success@Example.com",
      username: "route_test_register",
      password: PASSWORD,
      consent: true,
    });
    const body = await response.json();

    expect(body.user.email).toBe("route-test-register-success@example.com");
  });

  it("returns 409 email_taken for a duplicate email", async () => {
    const response = await register({
      email: EXISTING_EMAIL,
      username: "some_other_username",
      password: PASSWORD,
      consent: true,
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("email_taken");
  });

  it("returns 409 username_taken for a duplicate username", async () => {
    const response = await register({
      email: "someone-else@example.com",
      username: EXISTING_USERNAME,
      password: PASSWORD,
      consent: true,
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("username_taken");
  });

  it("returns 400 weak_password for a too-short password", async () => {
    const response = await register({
      email: "weak@example.com",
      username: "weakpassuser",
      password: "short",
      consent: true,
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("weak_password");
  });

  it("returns 400 validation_error when consent is false", async () => {
    const response = await register({
      email: "noconsent@example.com",
      username: "noconsentuser",
      password: PASSWORD,
      consent: false,
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 400 validation_error for an invalid email", async () => {
    const response = await register({
      email: "not-an-email",
      username: "someuser",
      password: PASSWORD,
      consent: true,
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });
});
