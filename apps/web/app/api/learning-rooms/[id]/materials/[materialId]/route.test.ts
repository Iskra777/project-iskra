import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { DELETE, PATCH } from "./route";

const PREFIX = "material_id_";

function editMaterial(
  roomId: string,
  materialId: string,
  body: unknown,
  accessToken?: string,
) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return PATCH(
    new Request(
      `http://localhost/api/learning-rooms/${roomId}/materials/${materialId}`,
      { method: "PATCH", headers, body: JSON.stringify(body) },
    ),
    { params: Promise.resolve({ id: roomId, materialId }) },
  );
}

function removeMaterial(
  roomId: string,
  materialId: string,
  accessToken?: string,
) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return DELETE(
    new Request(
      `http://localhost/api/learning-rooms/${roomId}/materials/${materialId}`,
      { method: "DELETE", headers },
    ),
    { params: Promise.resolve({ id: roomId, materialId }) },
  );
}

let hostId: string;
let authorId: string;
let strangerId: string;
let roomId: string;
let materialId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [host, author, stranger] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}host@example.com`,
        username: `${PREFIX}host`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}author@example.com`,
        username: `${PREFIX}author`,
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
  authorId = author.id;
  strangerId = stranger.id;

  const room = await prisma.learningRoom.create({
    data: {
      hostId,
      title: "Book club",
      members: {
        create: [{ userId: hostId }, { userId: authorId }],
      },
    },
  });
  roomId = room.id;

  const material = await prisma.material.create({
    data: {
      roomId,
      addedById: authorId,
      title: "Official docs",
      url: "https://example.com/docs",
    },
  });
  materialId = material.id;
});

afterEach(async () => {
  await prisma.material.deleteMany({ where: { roomId } });
  await prisma.learningRoomMember.deleteMany({
    where: { userId: { in: [hostId, authorId, strangerId] } },
  });
  await prisma.learningRoom.deleteMany({
    where: { hostId: { in: [hostId, authorId, strangerId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [hostId, authorId, strangerId] } },
  });
});

describe("PATCH /api/learning-rooms/:id/materials/:materialId", () => {
  it("lets the author edit their material", async () => {
    const token = await signAccessToken(authorId);
    const response = await editMaterial(
      roomId,
      materialId,
      { title: "Official docs, v2" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.material.title).toBe("Official docs, v2");
  });

  it("lets the host edit someone else's material", async () => {
    const token = await signAccessToken(hostId);
    const response = await editMaterial(
      roomId,
      materialId,
      { note: "Moderator note" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.material.note).toBe("Moderator note");
  });

  it("returns 403 forbidden for a stranger", async () => {
    const token = await signAccessToken(strangerId);
    const response = await editMaterial(
      roomId,
      materialId,
      { title: "Hijacked" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 404 not_found for a missing material", async () => {
    const token = await signAccessToken(authorId);
    const response = await editMaterial(
      roomId,
      crypto.randomUUID(),
      { title: "New title" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 400 validation_error for an invalid url", async () => {
    const token = await signAccessToken(authorId);
    const response = await editMaterial(
      roomId,
      materialId,
      { url: "not-a-url" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await editMaterial(roomId, materialId, {
      title: "New title",
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("DELETE /api/learning-rooms/:id/materials/:materialId", () => {
  it("lets the author delete their material", async () => {
    const token = await signAccessToken(authorId);
    const response = await removeMaterial(roomId, materialId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const material = await prisma.material.findUnique({
      where: { id: materialId },
    });
    expect(material).toBeNull();
  });

  it("lets the host delete someone else's material", async () => {
    const token = await signAccessToken(hostId);
    const response = await removeMaterial(roomId, materialId, token);

    expect(response.status).toBe(200);

    const material = await prisma.material.findUnique({
      where: { id: materialId },
    });
    expect(material).toBeNull();
  });

  it("returns 403 forbidden for a stranger", async () => {
    const token = await signAccessToken(strangerId);
    const response = await removeMaterial(roomId, materialId, token);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");

    const material = await prisma.material.findUnique({
      where: { id: materialId },
    });
    expect(material).not.toBeNull();
  });

  it("returns 404 not_found for a missing material", async () => {
    const token = await signAccessToken(authorId);
    const response = await removeMaterial(roomId, crypto.randomUUID(), token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await removeMaterial(roomId, materialId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
