import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { DELETE, GET, PATCH } from "./route";

const PREFIX = "diary_id_";

function getEntry(entryId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(
    new Request(`http://localhost/api/diary/${entryId}`, { headers }),
    {
      params: Promise.resolve({ id: entryId }),
    },
  );
}

function editEntry(entryId: string, body: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return PATCH(
    new Request(`http://localhost/api/diary/${entryId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: entryId }) },
  );
}

function removeEntry(entryId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return DELETE(
    new Request(`http://localhost/api/diary/${entryId}`, {
      method: "DELETE",
      headers,
    }),
    { params: Promise.resolve({ id: entryId }) },
  );
}

let ownerId: string;
let strangerId: string;
let entryId: string;

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

  const entry = await prisma.diaryEntry.create({
    data: { userId: ownerId, content: "Original entry" },
  });
  entryId = entry.id;
});

afterEach(async () => {
  await prisma.diaryEntry.deleteMany({
    where: { userId: { in: [ownerId, strangerId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [ownerId, strangerId] } },
  });
});

describe("GET /api/diary/:id", () => {
  it("returns the owner's entry", async () => {
    const token = await signAccessToken(ownerId);
    const response = await getEntry(entryId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entry.id).toBe(entryId);
    expect(body.entry.content).toBe("Original entry");
  });

  it("returns 404 not_found for a stranger's entry", async () => {
    const token = await signAccessToken(strangerId);
    const response = await getEntry(entryId, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await getEntry(entryId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("PATCH /api/diary/:id", () => {
  it("updates title and content", async () => {
    const token = await signAccessToken(ownerId);
    const response = await editEntry(
      entryId,
      { title: "New title", content: "Updated content" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entry.title).toBe("New title");
    expect(body.entry.content).toBe("Updated content");
  });

  it("supports partial updates, leaving other fields untouched", async () => {
    const token = await signAccessToken(ownerId);
    const response = await editEntry(entryId, { title: "Just a title" }, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entry.title).toBe("Just a title");
    expect(body.entry.content).toBe("Original entry");
  });

  it("returns 404 not_found for a stranger's entry", async () => {
    const token = await signAccessToken(strangerId);
    const response = await editEntry(entryId, { content: "Hijacked" }, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 400 validation_error for empty content", async () => {
    const token = await signAccessToken(ownerId);
    const response = await editEntry(entryId, { content: "  " }, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await editEntry(entryId, { content: "Hijacked" });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("DELETE /api/diary/:id", () => {
  it("hard-deletes the owner's entry", async () => {
    const token = await signAccessToken(ownerId);
    const response = await removeEntry(entryId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const entry = await prisma.diaryEntry.findUnique({
      where: { id: entryId },
    });
    expect(entry).toBeNull();
  });

  it("returns 404 not_found for a stranger's entry", async () => {
    const token = await signAccessToken(strangerId);
    const response = await removeEntry(entryId, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");

    const entry = await prisma.diaryEntry.findUnique({
      where: { id: entryId },
    });
    expect(entry).not.toBeNull();
  });

  it("returns 401 without a token", async () => {
    const response = await removeEntry(entryId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
