import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { GET } from "./route";

const PREFIX = "lroomid_";

function getRoom(roomId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(
    new Request(`http://localhost/api/learning-rooms/${roomId}`, { headers }),
    { params: Promise.resolve({ id: roomId }) },
  );
}

let hostId: string;
let strangerId: string;
let roomId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [host, stranger] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}host@example.com`,
        username: `${PREFIX}host`,
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
  hostId = host.id;
  strangerId = stranger.id;

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
    where: { userId: { in: [hostId, strangerId] } },
  });
  await prisma.learningRoom.deleteMany({
    where: { hostId: { in: [hostId, strangerId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [hostId, strangerId] } },
  });
});

describe("GET /api/learning-rooms/:id", () => {
  it("returns the room with host info to any authenticated viewer", async () => {
    const token = await signAccessToken(strangerId);
    const response = await getRoom(roomId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.room.id).toBe(roomId);
    expect(body.room.title).toBe("Book club");
    expect(body.room.host.id).toBe(hostId);
    expect(body.room.host.username).toBe(`${PREFIX}host`);
  });

  it("reports viewerIsMember correctly", async () => {
    const hostToken = await signAccessToken(hostId);
    const hostResponse = await getRoom(roomId, hostToken);
    const hostBody = await hostResponse.json();
    expect(hostBody.room.viewerIsMember).toBe(true);

    const strangerToken = await signAccessToken(strangerId);
    const strangerResponse = await getRoom(roomId, strangerToken);
    const strangerBody = await strangerResponse.json();
    expect(strangerBody.room.viewerIsMember).toBe(false);
  });

  it("returns 404 not_found for a missing room", async () => {
    const token = await signAccessToken(strangerId);
    const response = await getRoom(crypto.randomUUID(), token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await getRoom(roomId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
