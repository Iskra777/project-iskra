import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import {
  checkGoalCompletedAchievements,
  checkGoalCreatedAchievements,
  checkProgressRecordedAchievements,
} from "@/lib/achievements";

const PREFIX = "achievements_";

let userId: string;

async function earnedCodes(): Promise<string[]> {
  const rows = await prisma.userAchievement.findMany({
    where: { userId },
    include: { achievement: true },
  });
  return rows.map((row) => row.achievement.code);
}

beforeEach(async () => {
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
  await prisma.progress.deleteMany({ where: { userId } });
  await prisma.goal.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
});

describe("checkGoalCreatedAchievements", () => {
  it("returns and awards first_goal_created after the user's first goal", async () => {
    await prisma.goal.create({ data: { userId, title: "Read 12 books" } });

    const newlyEarned = await checkGoalCreatedAchievements(userId);

    expect(newlyEarned.map((a) => a.code)).toEqual(["first_goal_created"]);
    expect(newlyEarned[0].title).toBe("Перший крок");
    expect(await earnedCodes()).toEqual(["first_goal_created"]);

    const achievement = await prisma.achievement.findUnique({
      where: { code: "first_goal_created" },
    });
    expect(achievement?.title).toBe("Перший крок");
  });

  it("returns empty (not the achievement again) on repeated calls, without duplicating", async () => {
    await prisma.goal.create({ data: { userId, title: "Read 12 books" } });

    const first = await checkGoalCreatedAchievements(userId);
    const second = await checkGoalCreatedAchievements(userId);

    expect(first.map((a) => a.code)).toEqual(["first_goal_created"]);
    expect(second).toEqual([]);

    const rows = await prisma.userAchievement.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
  });

  it("does not award anything with zero goals", async () => {
    const newlyEarned = await checkGoalCreatedAchievements(userId);

    expect(newlyEarned).toEqual([]);
    expect(await earnedCodes()).toEqual([]);
  });
});

describe("checkProgressRecordedAchievements", () => {
  it("returns and awards first_progress_recorded after the first progress record", async () => {
    const goal = await prisma.goal.create({
      data: { userId, title: "Run a marathon" },
    });
    await prisma.progress.create({
      data: { userId, goalId: goal.id, value: 10 },
    });

    const newlyEarned = await checkProgressRecordedAchievements(userId);

    expect(newlyEarned.map((a) => a.code)).toEqual(["first_progress_recorded"]);
    expect(await earnedCodes()).toEqual(["first_progress_recorded"]);
  });
});

describe("checkGoalCompletedAchievements", () => {
  it("returns and awards first_goal_completed when one goal is completed", async () => {
    await prisma.goal.create({
      data: { userId, title: "Goal 1", status: "completed" },
    });

    const newlyEarned = await checkGoalCompletedAchievements(userId);

    expect(newlyEarned.map((a) => a.code)).toEqual(["first_goal_completed"]);
    expect(await earnedCodes()).toEqual(["first_goal_completed"]);
  });

  it("returns both first_goal_completed and five_goals_completed at five", async () => {
    for (let i = 0; i < 5; i++) {
      await prisma.goal.create({
        data: { userId, title: `Goal ${i}`, status: "completed" },
      });
    }

    const newlyEarned = await checkGoalCompletedAchievements(userId);

    const newCodes = newlyEarned.map((a) => a.code);
    expect(newCodes).toContain("first_goal_completed");
    expect(newCodes).toContain("five_goals_completed");
    expect(newCodes).toHaveLength(2);

    const codes = await earnedCodes();
    expect(codes).toHaveLength(2);
  });

  it("does not award five_goals_completed below the threshold", async () => {
    for (let i = 0; i < 4; i++) {
      await prisma.goal.create({
        data: { userId, title: `Goal ${i}`, status: "completed" },
      });
    }

    const newlyEarned = await checkGoalCompletedAchievements(userId);

    const newCodes = newlyEarned.map((a) => a.code);
    expect(newCodes).toContain("first_goal_completed");
    expect(newCodes).not.toContain("five_goals_completed");
  });

  it("returns empty on the second call past the threshold (no duplicates)", async () => {
    for (let i = 0; i < 6; i++) {
      await prisma.goal.create({
        data: { userId, title: `Goal ${i}`, status: "completed" },
      });
    }

    const first = await checkGoalCompletedAchievements(userId);
    const second = await checkGoalCompletedAchievements(userId);

    expect(first).toHaveLength(2);
    expect(second).toEqual([]);

    const codes = await earnedCodes();
    expect(codes).toHaveLength(2);
  });
});
