import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { DELETE, PUT } from "./route";

const PREFIX = "lroom_members_";

function joinRoom(roomId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return PUT(
    new Request(`http://localhost/api/learning-rooms/${roomId}/members`, {
      method: "PUT",
      headers,
    }),
    { params: Promise.resolve({ id: roomId }) },
  );
}

function leaveRoom(roomId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return DELETE(
    new Request(`http://localhost/api/learning-rooms/${roomId}/members`, {
      method: "DELETE",
      headers,
    }),
    { params: Promise.resolve({ id: roomId }) },
  );
}

let hostId: string;
let memberId: string;
let roomId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [host, member] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}host@example.com`,
        username: `${PREFIX}host`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}member@example.com`,
        username: `${PREFIX}member`,
        passwordHash,
      },
    }),
  ]);
  hostId = host.id;
  memberId = member.id;

  const room = await prisma.learningRoom.create({
    data: {
      hostId,
      title: "Book club",
      members: { create: [{ userId: hostId }] },
    },
  });
  roomId = room.id;
});

afterEach(async () => {
  await prisma.learningRoomMember.deleteMany({
    where: { userId: { in: [hostId, memberId] } },
  });
  await prisma.learningRoom.deleteMany({
    where: { hostId: { in: [hostId, memberId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [hostId, memberId] } },
  });
});

describe("PUT /api/learning-rooms/:id/members", () => {
  it("joins the room", async () => {
    const token = await signAccessToken(memberId);
    const response = await joinRoom(roomId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const membership = await prisma.learningRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId: memberId } },
    });
    expect(membership).not.toBeNull();
  });

  it("is idempotent when joining twice", async () => {
    const token = await signAccessToken(memberId);
    await joinRoom(roomId, token);
    const response = await joinRoom(roomId, token);

    expect(response.status).toBe(200);

    const count = await prisma.learningRoomMember.count({
      where: { roomId, userId: memberId },
    });
    expect(count).toBe(1);
  });

  it("returns 404 not_found for a missing room", async () => {
    const token = await signAccessToken(memberId);
    const response = await joinRoom(crypto.randomUUID(), token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await joinRoom(roomId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("DELETE /api/learning-rooms/:id/members", () => {
  it("lets a member leave", async () => {
    const token = await signAccessToken(memberId);
    await joinRoom(roomId, token);
    const response = await leaveRoom(roomId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const membership = await prisma.learningRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId: memberId } },
    });
    expect(membership).toBeNull();
  });

  it("is idempotent when there is nothing to leave", async () => {
    const token = await signAccessToken(memberId);
    const response = await leaveRoom(roomId, token);

    expect(response.status).toBe(200);
  });

  it("returns 400 host_cannot_leave for the host", async () => {
    const token = await signAccessToken(hostId);
    const response = await leaveRoom(roomId, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("host_cannot_leave");

    const membership = await prisma.learningRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId: hostId } },
    });
    expect(membership).not.toBeNull();
  });

  it("returns 404 not_found for a missing room", async () => {
    const token = await signAccessToken(memberId);
    const response = await leaveRoom(crypto.randomUUID(), token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await leaveRoom(roomId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
