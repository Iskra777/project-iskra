import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { PATCH } from "./route";

const PREFIX = "conv_read_test_";

function markRead(conversationId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return PATCH(
    new Request(`http://localhost/api/conversations/${conversationId}/read`, {
      method: "PATCH",
      headers,
    }),
    { params: Promise.resolve({ id: conversationId }) },
  );
}

let aliceId: string;
let bobId: string;
let carolId: string;
let conversationId: string;

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

  const conversation = await prisma.conversation.create({
    data: {
      type: "direct",
      participants: { create: [{ userId: aliceId }, { userId: bobId }] },
    },
  });
  conversationId = conversation.id;
});

afterEach(async () => {
  await prisma.message.deleteMany({ where: { conversationId } });
  await prisma.conversationParticipant.deleteMany({
    where: { conversationId },
  });
  await prisma.conversation.deleteMany({ where: { id: conversationId } });
  await prisma.user.deleteMany({
    where: { id: { in: [aliceId, bobId, carolId] } },
  });
});

describe("PATCH /api/conversations/:id/read", () => {
  it("оновлює lastReadAt учасника", async () => {
    const token = await signAccessToken(aliceId);
    const response = await markRead(conversationId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.lastReadAt).toBe("string");

    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: aliceId } },
    });
    expect(participant?.lastReadAt).not.toBeNull();
    expect(participant?.lastReadAt?.toISOString()).toBe(body.lastReadAt);
  });

  it("повертає 404 not_found для не-учасника", async () => {
    const token = await signAccessToken(carolId);
    const response = await markRead(conversationId, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("повертає 404 not_found для неіснуючої розмови", async () => {
    const token = await signAccessToken(aliceId);
    const response = await markRead(
      "00000000-0000-0000-0000-000000000000",
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("повертає 401 без токена", async () => {
    const response = await markRead(conversationId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
