import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { POST } from "./route";

const PREFIX = "grp_a_";

function addParticipants(
  conversationId: string,
  usernames: unknown,
  accessToken?: string,
) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request(
      `http://localhost/api/conversations/${conversationId}/participants`,
      { method: "POST", headers, body: JSON.stringify({ usernames }) },
    ),
    { params: Promise.resolve({ id: conversationId }) },
  );
}

let aliceId: string;
let bobId: string;
let carolId: string;
let daveId: string;
let groupId: string;
let directId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [alice, bob, carol, dave] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}alice@example.com`,
        username: `${PREFIX}alice`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}bob@example.com`,
        username: `${PREFIX}bob`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}carol@example.com`,
        username: `${PREFIX}carol`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}dave@example.com`,
        username: `${PREFIX}dave`,
        passwordHash,
      },
    }),
  ]);
  aliceId = alice.id;
  bobId = bob.id;
  carolId = carol.id;
  daveId = dave.id;

  const group = await prisma.conversation.create({
    data: {
      type: "group",
      title: "Тест-група",
      participants: {
        create: [
          { userId: aliceId, role: "admin" },
          { userId: bobId, role: "member" },
        ],
      },
    },
  });
  groupId = group.id;

  const direct = await prisma.conversation.create({
    data: {
      type: "direct",
      participants: { create: [{ userId: aliceId }, { userId: bobId }] },
    },
  });
  directId = direct.id;
});

afterEach(async () => {
  const conversationIds = [groupId, directId];
  await prisma.conversationParticipant.deleteMany({
    where: { conversationId: { in: conversationIds } },
  });
  await prisma.conversation.deleteMany({
    where: { id: { in: conversationIds } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [aliceId, bobId, carolId, daveId] } },
  });
});

describe("POST /api/conversations/:id/participants", () => {
  it("admin can add new participants", async () => {
    const token = await signAccessToken(aliceId);
    const response = await addParticipants(
      groupId,
      [`${PREFIX}carol`, `${PREFIX}dave`],
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId: groupId },
    });
    expect(participants).toHaveLength(4);
    expect(participants.find((p) => p.userId === carolId)?.role).toBe("member");
  });

  it("silently skips already-existing participants", async () => {
    const token = await signAccessToken(aliceId);
    const response = await addParticipants(
      groupId,
      [`${PREFIX}bob`, `${PREFIX}carol`],
      token,
    );

    expect(response.status).toBe(200);

    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId: groupId },
    });
    expect(participants).toHaveLength(3);
  });

  it("returns 403 forbidden for a non-admin member", async () => {
    const token = await signAccessToken(bobId);
    const response = await addParticipants(groupId, [`${PREFIX}carol`], token);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 404 not_found for a non-participant", async () => {
    const token = await signAccessToken(carolId);
    const response = await addParticipants(groupId, [`${PREFIX}dave`], token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 400 not_a_group for a direct conversation", async () => {
    const token = await signAccessToken(aliceId);
    const response = await addParticipants(directId, [`${PREFIX}carol`], token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("not_a_group");
  });

  it("returns 404 not_found for a nonexistent username", async () => {
    const token = await signAccessToken(aliceId);
    const response = await addParticipants(groupId, [`${PREFIX}nobody`], token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await addParticipants(groupId, [`${PREFIX}carol`]);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
