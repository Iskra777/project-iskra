import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { GET, POST } from "./route";

const PREFIX = "diary_";

function createEntry(body: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request("http://localhost/api/diary", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

function listEntries(query: Record<string, string> = {}, accessToken?: string) {
  const url = new URL("http://localhost/api/diary");
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(new Request(url, { headers }));
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
  await prisma.diaryEntry.deleteMany({
    where: { userId: { in: [userId, otherUserId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [userId, otherUserId] } },
  });
});

describe("POST /api/diary", () => {
  it("creates an entry with content only", async () => {
    const token = await signAccessToken(userId);
    const response = await createEntry(
      { content: "Today was a good day." },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.entry.content).toBe("Today was a good day.");
    expect(body.entry.title).toBeNull();
  });

  it("accepts an optional title", async () => {
    const token = await signAccessToken(userId);
    const response = await createEntry(
      { title: "Reflections", content: "Today was a good day." },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.entry.title).toBe("Reflections");
  });

  it("returns 400 validation_error for empty content", async () => {
    const token = await signAccessToken(userId);
    const response = await createEntry({ content: "  " }, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await createEntry({ content: "Today was a good day." });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("GET /api/diary", () => {
  it("lists only the viewer's own entries, newest first", async () => {
    const first = await prisma.diaryEntry.create({
      data: { userId, content: "First entry" },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await prisma.diaryEntry.create({
      data: { userId, content: "Second entry" },
    });
    await prisma.diaryEntry.create({
      data: { userId: otherUserId, content: "Someone else's entry" },
    });

    const token = await signAccessToken(userId);
    const response = await listEntries({}, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entries.map((e: { id: string }) => e.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it("returns an empty list when the viewer has no entries", async () => {
    const token = await signAccessToken(userId);
    const response = await listEntries({}, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entries).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it("paginates with a cursor", async () => {
    const first = await prisma.diaryEntry.create({
      data: { userId, content: "First entry" },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await prisma.diaryEntry.create({
      data: { userId, content: "Second entry" },
    });

    const token = await signAccessToken(userId);
    const page1 = await listEntries({ limit: "1" }, token);
    const page1Body = await page1.json();

    expect(page1Body.entries).toHaveLength(1);
    expect(page1Body.entries[0].id).toBe(second.id);
    expect(page1Body.nextCursor).not.toBeNull();

    const page2 = await listEntries(
      { limit: "1", before: page1Body.nextCursor },
      token,
    );
    const page2Body = await page2.json();

    expect(page2Body.entries).toHaveLength(1);
    expect(page2Body.entries[0].id).toBe(first.id);
  });

  it("returns 400 validation_error for a cursor from a different user", async () => {
    const otherEntry = await prisma.diaryEntry.create({
      data: { userId: otherUserId, content: "Not yours" },
    });

    const token = await signAccessToken(userId);
    const response = await listEntries({ before: otherEntry.id }, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await listEntries();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
