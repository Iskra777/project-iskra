import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { GET } from "./route";

const USERNAME_PREFIX = "search_test_";

function search(q: string) {
  return GET(
    new Request(`http://localhost/api/users/search?q=${encodeURIComponent(q)}`),
  );
}

let userIds: string[] = [];

beforeEach(async () => {
  const passwordHash = await hashPassword("correct horse battery staple");
  const [ivan, ivanna, inactive, deleted] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${USERNAME_PREFIX}ivan@example.com`,
        username: `${USERNAME_PREFIX}ivan`,
        displayName: "Ivan Petrenko",
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${USERNAME_PREFIX}ivanna@example.com`,
        username: `${USERNAME_PREFIX}ivanna`,
        displayName: "Ivanna Kovalenko",
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${USERNAME_PREFIX}inactive@example.com`,
        username: `${USERNAME_PREFIX}inactive_ivan`,
        passwordHash,
        isActive: false,
      },
    }),
    prisma.user.create({
      data: {
        email: `${USERNAME_PREFIX}deleted@example.com`,
        username: `${USERNAME_PREFIX}deleted_ivan`,
        passwordHash,
        deletedAt: new Date(),
      },
    }),
  ]);
  userIds = [ivan.id, ivanna.id, inactive.id, deleted.id];
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("GET /api/users/search", () => {
  it("finds users by a substring of username or displayName, case-insensitively", async () => {
    const response = await search("IVAN");
    const body = await response.json();

    expect(response.status).toBe(200);
    const usernames = body.users.map((u: { username: string }) => u.username);
    expect(usernames).toContain(`${USERNAME_PREFIX}ivan`);
    expect(usernames).toContain(`${USERNAME_PREFIX}ivanna`);
  });

  it("excludes deactivated and deleted accounts", async () => {
    const response = await search(USERNAME_PREFIX);
    const body = await response.json();

    const usernames = body.users.map((u: { username: string }) => u.username);
    expect(usernames).not.toContain(`${USERNAME_PREFIX}inactive_ivan`);
    expect(usernames).not.toContain(`${USERNAME_PREFIX}deleted_ivan`);
  });

  it("returns 400 validation_error for a query shorter than 2 characters", async () => {
    const response = await search("a");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns an empty list when nothing matches", async () => {
    const response = await search("zzz_no_such_user_zzz");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.users).toEqual([]);
  });
});
