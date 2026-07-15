import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { POST } from "./route";

const PREFIX = "msg_send_test_";

function sendMessage(
  conversationId: string,
  content: unknown,
  accessToken?: string,
) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request(
      `http://localhost/api/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ content }),
      },
    ),
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

describe("POST /api/conversations/:id/messages", () => {
  it("sends a message and updates conversation/participant state", async () => {
    const token = await signAccessToken(aliceId);
    const response = await sendMessage(conversationId, "Привіт!", token);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.message.content).toBe("Привіт!");
    expect(body.message.senderId).toBe(aliceId);

    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: aliceId } },
    });
    expect(participant?.lastReadAt).not.toBeNull();

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    expect(conversation?.updatedAt).not.toBeNull();
  });

  it("returns 404 not_found for a non-participant", async () => {
    const token = await signAccessToken(carolId);
    const response = await sendMessage(conversationId, "Привіт!", token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 404 not_found for a nonexistent conversation", async () => {
    const token = await signAccessToken(aliceId);
    const response = await sendMessage(
      "00000000-0000-0000-0000-000000000000",
      "Привіт!",
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 400 validation_error for empty content", async () => {
    const token = await signAccessToken(aliceId);
    const response = await sendMessage(conversationId, "   ", token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 400 validation_error for content over the length limit", async () => {
    const token = await signAccessToken(aliceId);
    const response = await sendMessage(conversationId, "a".repeat(5001), token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await sendMessage(conversationId, "Привіт!");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
