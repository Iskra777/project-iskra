import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { DELETE } from "./route";

const PREFIX = "grp_r_";

function removeParticipant(
  conversationId: string,
  targetUserId: string,
  accessToken?: string,
) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return DELETE(
    new Request(
      `http://localhost/api/conversations/${conversationId}/participants/${targetUserId}`,
      { method: "DELETE", headers },
    ),
    { params: Promise.resolve({ id: conversationId, userId: targetUserId }) },
  );
}

let aliceId: string;
let bobId: string;
let carolId: string;
let groupId: string;
let directId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [alice, bob, carol] = await Promise.all([
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
  ]);
  aliceId = alice.id;
  bobId = bob.id;
  carolId = carol.id;

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
    where: { id: { in: [aliceId, bobId, carolId] } },
  });
});

describe("DELETE /api/conversations/:id/participants/:userId", () => {
  it("admin can remove a member", async () => {
    const token = await signAccessToken(aliceId);
    const response = await removeParticipant(groupId, bobId, token);
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

  it("returns 400 cannot_remove_self when the admin targets themselves", async () => {
    const token = await signAccessToken(aliceId);
    const response = await removeParticipant(groupId, aliceId, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("cannot_remove_self");
  });

  it("returns 403 forbidden for a non-admin member", async () => {
    const token = await signAccessToken(bobId);
    const response = await removeParticipant(groupId, aliceId, token);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 404 not_found for a non-participant actor", async () => {
    const token = await signAccessToken(carolId);
    const response = await removeParticipant(groupId, bobId, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 404 not_participant when the target isn't in the group", async () => {
    const token = await signAccessToken(aliceId);
    const response = await removeParticipant(groupId, carolId, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_participant");
  });

  it("returns 400 not_a_group for a direct conversation", async () => {
    const token = await signAccessToken(aliceId);
    const response = await removeParticipant(directId, bobId, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("not_a_group");
  });

  it("returns 401 without a token", async () => {
    const response = await removeParticipant(groupId, bobId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
