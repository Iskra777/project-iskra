import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { GET, POST } from "./route";

const PREFIX = "goal_";

function createGoal(body: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request("http://localhost/api/goals", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

function listGoals(accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(new Request("http://localhost/api/goals", { headers }));
}

let userId: string;
let otherUserId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [user, otherUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}user@example.com`,
        username: `${PREFIX}user`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}other@example.com`,
        username: `${PREFIX}other`,
        passwordHash,
      },
    }),
  ]);
  userId = user.id;
  otherUserId = otherUser.id;
});

afterEach(async () => {
  await prisma.userAchievement.deleteMany({
    where: { userId: { in: [userId, otherUserId] } },
  });
  await prisma.goal.deleteMany({
    where: { userId: { in: [userId, otherUserId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [userId, otherUserId] } },
  });
});

describe("POST /api/goals", () => {
  it("creates a goal with defaults", async () => {
    const token = await signAccessToken(userId);
    const response = await createGoal({ title: "Read 12 books" }, token);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.goal.title).toBe("Read 12 books");
    expect(body.goal.status).toBe("active");
    expect(body.goal.isPrivate).toBe(true);
    expect(body.goal.description).toBeNull();
    expect(body.goal.deadline).toBeNull();
  });

  it("returns the first_goal_created achievement on the first goal, and nothing on the second", async () => {
    const token = await signAccessToken(userId);
    const first = await createGoal({ title: "Goal 1" }, token);
    const firstBody = await first.json();

    expect(
      firstBody.newAchievements.map((a: { code: string }) => a.code),
    ).toEqual(["first_goal_created"]);

    const second = await createGoal({ title: "Goal 2" }, token);
    const secondBody = await second.json();

    expect(secondBody.newAchievements).toEqual([]);
  });

  it("accepts description, deadline, and isPrivate", async () => {
    const token = await signAccessToken(userId);
    const response = await createGoal(
      {
        title: "Learn Ukrainian sign language",
        description: "Weekly lessons",
        deadline: "2027-01-01T00:00:00.000Z",
        isPrivate: false,
      },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.goal.description).toBe("Weekly lessons");
    expect(body.goal.deadline).toBe("2027-01-01T00:00:00.000Z");
    expect(body.goal.isPrivate).toBe(false);
  });

  it("returns 400 validation_error for an empty title", async () => {
    const token = await signAccessToken(userId);
    const response = await createGoal({ title: "  " }, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await createGoal({ title: "Read 12 books" });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("GET /api/goals", () => {
  it("lists only the viewer's own goals, newest first", async () => {
    const first = await prisma.goal.create({
      data: { userId, title: "First goal" },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await prisma.goal.create({
      data: { userId, title: "Second goal" },
    });
    await prisma.goal.create({
      data: { userId: otherUserId, title: "Someone else's goal" },
    });

    const token = await signAccessToken(userId);
    const response = await listGoals(token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.goals.map((g: { id: string }) => g.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it("returns an empty list when the viewer has no goals", async () => {
    const token = await signAccessToken(userId);
    const response = await listGoals(token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.goals).toEqual([]);
  });

  it("returns 401 without a token", async () => {
    const response = await listGoals();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
