import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { DELETE } from "./route";

const PREFIX = "grp_l_";

function leaveGroup(
  conversationId: string,
  body: unknown,
  accessToken?: string,
) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return DELETE(
    new Request(`http://localhost/api/conversations/${conversationId}/leave`, {
      method: "DELETE",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: conversationId }) },
  );
}

let aliceId: string;
let bobId: string;
let carolId: string;
let daveId: string;
let createdConversationIds: string[] = [];

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
  createdConversationIds = [];
});

afterEach(async () => {
  await prisma.conversationParticipant.deleteMany({
    where: { conversationId: { in: createdConversationIds } },
  });
  await prisma.conversation.deleteMany({
    where: { id: { in: createdConversationIds } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [aliceId, bobId, carolId, daveId] } },
  });
});

async function makeGroup(
  participants: { userId: string; role: "admin" | "member" }[],
) {
  const group = await prisma.conversation.create({
    data: {
      type: "group",
      title: "Тест-група",
      participants: { create: participants },
    },
  });
  createdConversationIds.push(group.id);
  return group.id;
}

describe("DELETE /api/conversations/:id/leave", () => {
  it("a non-admin member leaves without needing to specify a new admin", async () => {
    const groupId = await makeGroup([
      { userId: aliceId, role: "admin" },
      { userId: bobId, role: "member" },
    ]);
    const token = await signAccessToken(bobId);
    const response = await leaveGroup(groupId, undefined, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId: groupId, userId: bobId },
      },
    });
    expect(participant).toBeNull();
  });

  it("returns 400 admin_required when the sole admin leaves without a successor", async () => {
    const groupId = await makeGroup([
      { userId: aliceId, role: "admin" },
      { userId: bobId, role: "member" },
    ]);
    const token = await signAccessToken(aliceId);
    const response = await leaveGroup(groupId, undefined, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("admin_required");

    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId: groupId, userId: aliceId },
      },
    });
    expect(participant).not.toBeNull();
  });

  it("promotes newAdminUserId and leaves when the sole admin specifies a successor", async () => {
    const groupId = await makeGroup([
      { userId: aliceId, role: "admin" },
      { userId: bobId, role: "member" },
    ]);
    const token = await signAccessToken(aliceId);
    const response = await leaveGroup(
      groupId,
      { newAdminUserId: bobId },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const alice = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId: groupId, userId: aliceId },
      },
    });
    expect(alice).toBeNull();

    const bob = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId: groupId, userId: bobId },
      },
    });
    expect(bob?.role).toBe("admin");
  });

  it("returns 400 invalid_new_admin for a successor who isn't a participant", async () => {
    const groupId = await makeGroup([
      { userId: aliceId, role: "admin" },
      { userId: bobId, role: "member" },
    ]);
    const token = await signAccessToken(aliceId);
    const response = await leaveGroup(
      groupId,
      { newAdminUserId: carolId },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_new_admin");
  });

  it("an admin leaves freely when another admin already exists", async () => {
    const groupId = await makeGroup([
      { userId: aliceId, role: "admin" },
      { userId: bobId, role: "admin" },
      { userId: carolId, role: "member" },
    ]);
    const token = await signAccessToken(aliceId);
    const response = await leaveGroup(groupId, undefined, token);

    expect(response.status).toBe(200);
  });

  it("the last remaining participant can leave, emptying the group", async () => {
    const groupId = await makeGroup([{ userId: aliceId, role: "admin" }]);
    const token = await signAccessToken(aliceId);
    const response = await leaveGroup(groupId, undefined, token);

    expect(response.status).toBe(200);

    const remaining = await prisma.conversationParticipant.count({
      where: { conversationId: groupId },
    });
    expect(remaining).toBe(0);
  });

  it("returns 404 not_found for a non-participant", async () => {
    const groupId = await makeGroup([
      { userId: aliceId, role: "admin" },
      { userId: bobId, role: "member" },
    ]);
    const token = await signAccessToken(daveId);
    const response = await leaveGroup(groupId, undefined, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 400 not_a_group for a direct conversation", async () => {
    const direct = await prisma.conversation.create({
      data: {
        type: "direct",
        participants: { create: [{ userId: aliceId }, { userId: bobId }] },
      },
    });
    createdConversationIds.push(direct.id);

    const token = await signAccessToken(aliceId);
    const response = await leaveGroup(direct.id, undefined, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("not_a_group");
  });

  it("returns 401 without a token", async () => {
    const groupId = await makeGroup([
      { userId: aliceId, role: "admin" },
      { userId: bobId, role: "member" },
    ]);
    const response = await leaveGroup(groupId, undefined);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
