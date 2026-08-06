import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { GET, POST } from "./route";

const PREFIX = "goal_progress_";

function addProgress(goalId: string, body: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request(`http://localhost/api/goals/${goalId}/progress`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: goalId }) },
  );
}

function getHistory(
  goalId: string,
  query: Record<string, string> = {},
  accessToken?: string,
) {
  const url = new URL(`http://localhost/api/goals/${goalId}/progress`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(new Request(url, { headers }), {
    params: Promise.resolve({ id: goalId }),
  });
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
    data: { userId: ownerId, title: "Read 12 books" },
  });
  goalId = goal.id;
});

afterEach(async () => {
  await prisma.userAchievement.deleteMany({
    where: { userId: { in: [ownerId, strangerId] } },
  });
  await prisma.progress.deleteMany({ where: { goalId } });
  await prisma.goal.deleteMany({ where: { id: goalId } });
  await prisma.user.deleteMany({
    where: { id: { in: [ownerId, strangerId] } },
  });
});

describe("POST /api/goals/:id/progress", () => {
  it("adds a progress record with value and note", async () => {
    const token = await signAccessToken(ownerId);
    const response = await addProgress(
      goalId,
      { value: 25, note: "First 3 books done" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.progress.value).toBe(25);
    expect(body.progress.note).toBe("First 3 books done");
    expect(body.progress.recordedAt).toBeDefined();
    expect(body.newAchievements.map((a: { code: string }) => a.code)).toEqual([
      "first_progress_recorded",
    ]);

    const count = await prisma.progress.count({ where: { goalId } });
    expect(count).toBe(1);
  });

  it("adds a progress record with neither value nor note", async () => {
    const token = await signAccessToken(ownerId);
    const response = await addProgress(goalId, {}, token);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.progress.value).toBeNull();
    expect(body.progress.note).toBeNull();
  });

  it("allows multiple progress records on the same goal", async () => {
    const token = await signAccessToken(ownerId);
    await addProgress(goalId, { value: 10 }, token);
    const second = await addProgress(goalId, { value: 20 }, token);
    const secondBody = await second.json();

    expect(secondBody.newAchievements).toEqual([]);

    const count = await prisma.progress.count({ where: { goalId } });
    expect(count).toBe(2);
  });

  it("returns 404 not_found for a stranger's goal", async () => {
    const token = await signAccessToken(strangerId);
    const response = await addProgress(goalId, { value: 10 }, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");

    const count = await prisma.progress.count({ where: { goalId } });
    expect(count).toBe(0);
  });

  it("returns 400 validation_error for a non-integer value", async () => {
    const token = await signAccessToken(ownerId);
    const response = await addProgress(goalId, { value: 12.5 }, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 400 validation_error for a note over 2000 characters", async () => {
    const token = await signAccessToken(ownerId);
    const response = await addProgress(
      goalId,
      { note: "x".repeat(2001) },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await addProgress(goalId, { value: 10 });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("GET /api/goals/:id/progress", () => {
  it("returns history newest first", async () => {
    const token = await signAccessToken(ownerId);
    const first = await addProgress(goalId, { value: 10 }, token);
    const firstBody = await first.json();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await addProgress(goalId, { value: 20 }, token);
    const secondBody = await second.json();

    const response = await getHistory(goalId, {}, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.progress.map((p: { id: string }) => p.id)).toEqual([
      secondBody.progress.id,
      firstBody.progress.id,
    ]);
  });

  it("returns an empty history for a goal with no progress", async () => {
    const token = await signAccessToken(ownerId);
    const response = await getHistory(goalId, {}, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.progress).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it("paginates with a cursor", async () => {
    const token = await signAccessToken(ownerId);
    const first = await addProgress(goalId, { value: 10 }, token);
    const firstBody = await first.json();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await addProgress(goalId, { value: 20 }, token);
    const secondBody = await second.json();

    const page1 = await getHistory(goalId, { limit: "1" }, token);
    const page1Body = await page1.json();

    expect(page1Body.progress).toHaveLength(1);
    expect(page1Body.progress[0].id).toBe(secondBody.progress.id);
    expect(page1Body.nextCursor).not.toBeNull();

    const page2 = await getHistory(
      goalId,
      { limit: "1", before: page1Body.nextCursor },
      token,
    );
    const page2Body = await page2.json();

    expect(page2Body.progress).toHaveLength(1);
    expect(page2Body.progress[0].id).toBe(firstBody.progress.id);
  });

  it("returns 400 validation_error for a cursor from a different goal", async () => {
    const token = await signAccessToken(ownerId);
    const otherGoal = await prisma.goal.create({
      data: { userId: ownerId, title: "Other goal" },
    });
    const otherProgress = await prisma.progress.create({
      data: { userId: ownerId, goalId: otherGoal.id, value: 5 },
    });

    const response = await getHistory(
      goalId,
      { before: otherProgress.id },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");

    await prisma.progress.deleteMany({ where: { goalId: otherGoal.id } });
    await prisma.goal.delete({ where: { id: otherGoal.id } });
  });

  it("returns 404 not_found for a stranger's goal", async () => {
    const token = await signAccessToken(strangerId);
    const response = await getHistory(goalId, {}, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await getHistory(goalId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
