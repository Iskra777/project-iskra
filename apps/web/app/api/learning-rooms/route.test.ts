import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { GET, POST } from "./route";

const PREFIX = "lroom_";

function createRoom(body: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request("http://localhost/api/learning-rooms", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

function listRooms(query: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(
    new Request(`http://localhost/api/learning-rooms${query}`, { headers }),
  );
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
  await prisma.learningRoomMember.deleteMany({
    where: { userId: { in: [userId, otherUserId] } },
  });
  await prisma.learningRoom.deleteMany({
    where: { hostId: { in: [userId, otherUserId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [userId, otherUserId] } },
  });
});

describe("POST /api/learning-rooms", () => {
  it("creates a room and makes the host a member", async () => {
    const token = await signAccessToken(userId);
    const response = await createRoom({ title: "Learn Rust together" }, token);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.room.title).toBe("Learn Rust together");
    expect(body.room.description).toBeNull();
    expect(body.room.hostId).toBe(userId);

    const membership = await prisma.learningRoomMember.findUnique({
      where: { roomId_userId: { roomId: body.room.id, userId } },
    });
    expect(membership).not.toBeNull();
  });

  it("accepts a description", async () => {
    const token = await signAccessToken(userId);
    const response = await createRoom(
      { title: "Learn Rust together", description: "Weekly study group" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.room.description).toBe("Weekly study group");
  });

  it("returns 400 validation_error for an empty title", async () => {
    const token = await signAccessToken(userId);
    const response = await createRoom({ title: "  " }, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await createRoom({ title: "Learn Rust together" });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("GET /api/learning-rooms", () => {
  it("lists rooms newest first, across hosts", async () => {
    const first = await prisma.learningRoom.create({
      data: { hostId: userId, title: "First room" },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await prisma.learningRoom.create({
      data: { hostId: otherUserId, title: "Second room" },
    });

    const token = await signAccessToken(userId);
    const response = await listRooms("", token);
    const body = await response.json();

    expect(response.status).toBe(200);
    const ids = body.rooms
      .map((r: { id: string }) => r.id)
      .filter((id: string) => id === first.id || id === second.id);
    expect(ids).toEqual([second.id, first.id]);
  });

  it("paginates with nextCursor", async () => {
    for (let i = 0; i < 3; i++) {
      await prisma.learningRoom.create({
        data: { hostId: userId, title: `Room ${i}` },
      });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const token = await signAccessToken(userId);
    const first = await listRooms("?limit=2", token);
    const firstBody = await first.json();

    expect(firstBody.rooms).toHaveLength(2);
    expect(firstBody.nextCursor).not.toBeNull();
  });

  it("returns 400 validation_error for an invalid cursor", async () => {
    const token = await signAccessToken(userId);
    const response = await listRooms(`?before=${crypto.randomUUID()}`, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await listRooms("");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
