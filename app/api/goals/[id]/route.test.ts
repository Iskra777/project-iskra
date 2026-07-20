import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { DELETE, GET, PATCH } from "./route";

const PREFIX = "goal_id_";

function getGoal(goalId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(new Request(`http://localhost/api/goals/${goalId}`, { headers }), {
    params: Promise.resolve({ id: goalId }),
  });
}

function editGoal(goalId: string, body: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return PATCH(
    new Request(`http://localhost/api/goals/${goalId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: goalId }) },
  );
}

function removeGoal(goalId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return DELETE(
    new Request(`http://localhost/api/goals/${goalId}`, {
      method: "DELETE",
      headers,
    }),
    { params: Promise.resolve({ id: goalId }) },
  );
}

let ownerId: string;
let strangerId: string;
let goalId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [owner, stranger] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}owner@example.com`,
        username: `${PREFIX}owner`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}stranger@example.com`,
        username: `${PREFIX}stranger`,
        passwordHash,
      },
    }),
  ]);
  ownerId = owner.id;
  strangerId = stranger.id;

  const goal = await prisma.goal.create({
    data: { userId: ownerId, title: "Original goal" },
  });
  goalId = goal.id;
});

afterEach(async () => {
  await prisma.userAchievement.deleteMany({
    where: { userId: { in: [ownerId, strangerId] } },
  });
  await prisma.goal.deleteMany({
    where: { userId: { in: [ownerId, strangerId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [ownerId, strangerId] } },
  });
});

describe("GET /api/goals/:id", () => {
  it("returns the owner's goal", async () => {
    const token = await signAccessToken(ownerId);
    const response = await getGoal(goalId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.goal.id).toBe(goalId);
    expect(body.goal.title).toBe("Original goal");
  });

  it("returns 404 not_found for a stranger's goal", async () => {
    const token = await signAccessToken(strangerId);
    const response = await getGoal(goalId, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await getGoal(goalId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("PATCH /api/goals/:id", () => {
  it("updates title, description, deadline, status, and isPrivate", async () => {
    const token = await signAccessToken(ownerId);
    const response = await editGoal(
      goalId,
      {
        title: "Updated goal",
        description: "New description",
        deadline: "2027-06-01T00:00:00.000Z",
        status: "completed",
        isPrivate: false,
      },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.goal.title).toBe("Updated goal");
    expect(body.goal.description).toBe("New description");
    expect(body.goal.deadline).toBe("2027-06-01T00:00:00.000Z");
    expect(body.goal.status).toBe("completed");
    expect(body.goal.isPrivate).toBe(false);
    expect(body.newAchievements.map((a: { code: string }) => a.code)).toEqual([
      "first_goal_completed",
    ]);
  });

  it("supports partial updates, leaving other fields untouched", async () => {
    const token = await signAccessToken(ownerId);
    const response = await editGoal(goalId, { status: "abandoned" }, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.goal.status).toBe("abandoned");
    expect(body.goal.title).toBe("Original goal");
    expect(body.newAchievements).toEqual([]);
  });

  it("clears description and deadline when explicitly set to null", async () => {
    const token = await signAccessToken(ownerId);
    await prisma.goal.update({
      where: { id: goalId },
      data: { description: "Has a description", deadline: new Date() },
    });

    const response = await editGoal(
      goalId,
      { description: null, deadline: null },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.goal.description).toBeNull();
    expect(body.goal.deadline).toBeNull();
  });

  it("returns 404 not_found for a stranger's goal", async () => {
    const token = await signAccessToken(strangerId);
    const response = await editGoal(goalId, { title: "Hijacked" }, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 400 validation_error for an invalid status", async () => {
    const token = await signAccessToken(ownerId);
    const response = await editGoal(goalId, { status: "not_a_status" }, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await editGoal(goalId, { title: "Hijacked" });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("DELETE /api/goals/:id", () => {
  it("hard-deletes the owner's goal", async () => {
    const token = await signAccessToken(ownerId);
    const response = await removeGoal(goalId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const goal = await prisma.goal.findUnique({ where: { id: goalId } });
    expect(goal).toBeNull();
  });

  it("returns 404 not_found for a stranger's goal", async () => {
    const token = await signAccessToken(strangerId);
    const response = await removeGoal(goalId, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");

    const goal = await prisma.goal.findUnique({ where: { id: goalId } });
    expect(goal).not.toBeNull();
  });

  it("returns 401 without a token", async () => {
    const response = await removeGoal(goalId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
