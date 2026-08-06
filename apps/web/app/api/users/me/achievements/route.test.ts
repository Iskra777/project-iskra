import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { GET } from "./route";

const PREFIX = "achievements_list_test_";

function listAchievements(accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(
    new Request("http://localhost/api/users/me/achievements", { headers }),
  );
}

/** Той самий upsert-by-code підхід, що й lib/achievements.ts — не видаляти
 * рядок Achievement в afterEach (спільний каталог з іншими тестами). */
async function award(userId: string, code: string, earnedAt: Date) {
  const achievement = await prisma.achievement.upsert({
    where: { code },
    create: { code, title: `Test title for ${code}` },
    update: {},
  });
  await prisma.userAchievement.create({
    data: { userId, achievementId: achievement.id, earnedAt },
  });
}

let userId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
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
  await prisma.userAchievement.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
});

describe("GET /api/users/me/achievements", () => {
  it("returns earned achievements, newest first", async () => {
    await award(userId, "first_goal_created", new Date("2026-01-01"));
    await award(userId, "first_goal_completed", new Date("2026-02-01"));

    const response = await listAchievements(await signAccessToken(userId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.achievements.map((a: { code: string }) => a.code)).toEqual([
      "first_goal_completed",
      "first_goal_created",
    ]);
    expect(body.achievements[0].earnedAt).toBeDefined();
    expect(body.achievements[0].title).toBeDefined();
  });

  it("returns an empty list when the user has earned nothing", async () => {
    const response = await listAchievements(await signAccessToken(userId));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.achievements).toEqual([]);
  });

  it("returns 401 without a token", async () => {
    const response = await listAchievements();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
