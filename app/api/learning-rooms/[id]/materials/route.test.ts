import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { GET, POST } from "./route";

const PREFIX = "material_";

function addMaterial(roomId: string, body: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request(`http://localhost/api/learning-rooms/${roomId}/materials`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: roomId }) },
  );
}

function listMaterials(roomId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(
    new Request(`http://localhost/api/learning-rooms/${roomId}/materials`, {
      headers,
    }),
    { params: Promise.resolve({ id: roomId }) },
  );
}

let hostId: string;
let memberId: string;
let strangerId: string;
let roomId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [host, member, stranger] = await Promise.all([
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
    prisma.user.create({
      data: {
        email: `${PREFIX}stranger@example.com`,
        username: `${PREFIX}stranger`,
        passwordHash,
      },
    }),
  ]);
  hostId = host.id;
  memberId = member.id;
  strangerId = stranger.id;

  const room = await prisma.learningRoom.create({
    data: {
      hostId,
      title: "Book club",
      members: {
        create: [{ userId: hostId }, { userId: memberId }],
      },
    },
  });
  roomId = room.id;
});

afterEach(async () => {
  await prisma.material.deleteMany({ where: { roomId } });
  await prisma.learningRoomMember.deleteMany({
    where: { userId: { in: [hostId, memberId, strangerId] } },
  });
  await prisma.learningRoom.deleteMany({
    where: { hostId: { in: [hostId, memberId, strangerId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [hostId, memberId, strangerId] } },
  });
});

describe("POST /api/learning-rooms/:id/materials", () => {
  it("lets a member add a material", async () => {
    const token = await signAccessToken(memberId);
    const response = await addMaterial(
      roomId,
      { title: "Official docs", url: "https://example.com/docs" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.material.title).toBe("Official docs");
    expect(body.material.url).toBe("https://example.com/docs");
    expect(body.material.note).toBeNull();
    expect(body.material.addedById).toBe(memberId);
  });

  it("accepts a note", async () => {
    const token = await signAccessToken(hostId);
    const response = await addMaterial(
      roomId,
      {
        title: "Chapter 3",
        url: "https://example.com/ch3.pdf",
        note: "Skip the intro",
      },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.material.note).toBe("Skip the intro");
  });

  it("returns 400 validation_error for an invalid url", async () => {
    const token = await signAccessToken(memberId);
    const response = await addMaterial(
      roomId,
      { title: "Bad link", url: "not-a-url" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 403 forbidden for a non-member", async () => {
    const token = await signAccessToken(strangerId);
    const response = await addMaterial(
      roomId,
      { title: "Official docs", url: "https://example.com/docs" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 404 not_found for a missing room", async () => {
    const token = await signAccessToken(memberId);
    const response = await addMaterial(
      crypto.randomUUID(),
      { title: "Official docs", url: "https://example.com/docs" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await addMaterial(roomId, {
      title: "Official docs",
      url: "https://example.com/docs",
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("GET /api/learning-rooms/:id/materials", () => {
  it("lists materials for any authenticated viewer, including non-members", async () => {
    await prisma.material.create({
      data: {
        roomId,
        addedById: hostId,
        title: "Official docs",
        url: "https://example.com/docs",
      },
    });

    const token = await signAccessToken(strangerId);
    const response = await listMaterials(roomId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.materials).toHaveLength(1);
    expect(body.materials[0].title).toBe("Official docs");
  });

  it("returns an empty list when there are no materials", async () => {
    const token = await signAccessToken(memberId);
    const response = await listMaterials(roomId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.materials).toEqual([]);
  });

  it("returns 404 not_found for a missing room", async () => {
    const token = await signAccessToken(memberId);
    const response = await listMaterials(crypto.randomUUID(), token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await listMaterials(roomId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
