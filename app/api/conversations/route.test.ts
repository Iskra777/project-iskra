import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { GET, POST } from "./route";

const PREFIX = "conv_create_test_";

function createConversation(username: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request("http://localhost/api/conversations", {
      method: "POST",
      headers,
      body: JSON.stringify({ username }),
    }),
  );
}

function getConversations(accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(new Request("http://localhost/api/conversations", { headers }));
}

let aliceId: string;
let bobId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const alice = await prisma.user.create({
    data: {
      email: `${PREFIX}alice@example.com`,
      username: `${PREFIX}alice`,
      passwordHash,
    },
  });
  const bob = await prisma.user.create({
    data: {
      email: `${PREFIX}bob@example.com`,
      username: `${PREFIX}bob`,
      passwordHash,
    },
  });
  aliceId = alice.id;
  bobId = bob.id;
});

afterEach(async () => {
  await prisma.message.deleteMany({
    where: { senderId: { in: [aliceId, bobId] } },
  });
  await prisma.conversationParticipant.deleteMany({
    where: { userId: { in: [aliceId, bobId] } },
  });
  await prisma.conversation.deleteMany({
    where: { participants: { none: {} } },
  });
  await prisma.friendship.deleteMany({
    where: { OR: [{ requesterId: aliceId }, { addresseeId: aliceId }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: [aliceId, bobId] } } });
});

describe("POST /api/conversations", () => {
  it("creates a new direct conversation", async () => {
    const token = await signAccessToken(aliceId);
    const response = await createConversation(`${PREFIX}bob`, token);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.conversation.otherParticipant.username).toBe(`${PREFIX}bob`);

    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId: body.conversation.id },
    });
    expect(participants).toHaveLength(2);
  });

  it("reuses an existing direct conversation instead of duplicating it", async () => {
    const token = await signAccessToken(aliceId);
    const first = await createConversation(`${PREFIX}bob`, token);
    const firstBody = await first.json();

    const second = await createConversation(`${PREFIX}bob`, token);
    const secondBody = await second.json();

    expect(second.status).toBe(200);
    expect(secondBody.conversation.id).toBe(firstBody.conversation.id);

    const count = await prisma.conversation.count({
      where: { participants: { some: { userId: aliceId } } },
    });
    expect(count).toBe(1);
  });

  it("returns 400 cannot_message_self", async () => {
    const token = await signAccessToken(aliceId);
    const response = await createConversation(`${PREFIX}alice`, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("cannot_message_self");
  });

  it("returns 403 blocked when a blocked relationship exists", async () => {
    await prisma.friendship.create({
      data: { requesterId: bobId, addresseeId: aliceId, status: "blocked" },
    });
    const token = await signAccessToken(aliceId);
    const response = await createConversation(`${PREFIX}bob`, token);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("blocked");
  });

  it("returns 404 for a nonexistent username", async () => {
    const token = await signAccessToken(aliceId);
    const response = await createConversation(`${PREFIX}nobody`, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 400 validation_error when username is missing", async () => {
    const token = await signAccessToken(aliceId);
    const response = await createConversation(undefined, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await createConversation(`${PREFIX}bob`);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("GET /api/conversations", () => {
  it("повертає порожній список без розмов", async () => {
    const token = await signAccessToken(aliceId);
    const response = await getConversations(token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.conversations).toEqual([]);
  });

  it("повертає останнє повідомлення й unread=true, коли писав інший учасник", async () => {
    const aliceToken = await signAccessToken(aliceId);
    const created = await createConversation(`${PREFIX}bob`, aliceToken);
    const createdBody = await created.json();
    const conversationId = createdBody.conversation.id;

    await prisma.message.create({
      data: { conversationId, senderId: bobId, content: "Привіт!" },
    });

    const response = await getConversations(aliceToken);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.conversations).toHaveLength(1);
    const conversation = body.conversations[0];
    expect(conversation.otherParticipant.username).toBe(`${PREFIX}bob`);
    expect(conversation.lastMessage.content).toBe("Привіт!");
    expect(conversation.unread).toBe(true);
  });

  it("unread=false, коли останнє повідомлення від самого користувача", async () => {
    const aliceToken = await signAccessToken(aliceId);
    const created = await createConversation(`${PREFIX}bob`, aliceToken);
    const createdBody = await created.json();

    await prisma.message.create({
      data: {
        conversationId: createdBody.conversation.id,
        senderId: aliceId,
        content: "Привіт від мене",
      },
    });

    const response = await getConversations(aliceToken);
    const body = await response.json();

    expect(body.conversations[0].unread).toBe(false);
  });

  it("сортує розмови за активністю (найновіша перша)", async () => {
    const carol = await prisma.user.create({
      data: {
        email: `${PREFIX}carol@example.com`,
        username: `${PREFIX}carol`,
        passwordHash: await hashPassword("correct horse battery staple"),
      },
    });

    const aliceToken = await signAccessToken(aliceId);
    const firstConv = await (
      await createConversation(`${PREFIX}bob`, aliceToken)
    ).json();
    const secondConv = await (
      await createConversation(`${PREFIX}carol`, aliceToken)
    ).json();

    // Штучно робимо першу розмову новішою за активністю, ніж другу.
    await prisma.conversation.update({
      where: { id: firstConv.conversation.id },
      data: { updatedAt: new Date() },
    });

    const response = await getConversations(aliceToken);
    const body = await response.json();

    expect(body.conversations[0].id).toBe(firstConv.conversation.id);
    expect(body.conversations[1].id).toBe(secondConv.conversation.id);

    await prisma.conversationParticipant.deleteMany({
      where: { userId: carol.id },
    });
    await prisma.user.delete({ where: { id: carol.id } });
  });

  it("returns 401 without a token", async () => {
    const response = await getConversations();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
