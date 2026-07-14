import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "./password";
import { checkRegistrationAvailability } from "./registration-availability";

const EMAIL = "availability-check@example.com";
const USERNAME = "availability-check";

beforeAll(async () => {
  await prisma.user.create({
    data: {
      email: EMAIL,
      username: USERNAME,
      passwordHash: await hashPassword("correct horse battery staple"),
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
});

describe("checkRegistrationAvailability", () => {
  it("returns ok when both email and username are free", async () => {
    const result = await checkRegistrationAvailability(
      "free-email@example.com",
      "free-username",
    );
    expect(result).toEqual({ ok: true });
  });

  it("returns email_taken when the email is already registered", async () => {
    const result = await checkRegistrationAvailability(
      EMAIL,
      "some-other-username",
    );
    expect(result).toEqual({ ok: false, code: "email_taken" });
  });

  it("returns username_taken when the username is already registered", async () => {
    const result = await checkRegistrationAvailability(
      "other-email@example.com",
      USERNAME,
    );
    expect(result).toEqual({ ok: false, code: "username_taken" });
  });

  it("checks email before username when both are taken", async () => {
    const result = await checkRegistrationAvailability(EMAIL, USERNAME);
    expect(result).toEqual({ ok: false, code: "email_taken" });
  });
});
