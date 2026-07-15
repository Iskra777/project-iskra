import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { POST, GET } from "./route";

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

function getHistory(
  conversationId: string,
  query: string,
  accessToken?: string,
) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(
    new Request(
      `http://localhost/api/conversations/${conversationId}/messages${query}`,
      { headers },
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

describe("GET /api/conversations/:id/messages", () => {
  it("returns messages newest-first with a nextCursor when the page is full", async () => {
    const token = await signAccessToken(aliceId);
    for (const text of ["один", "два", "три"]) {
      await sendMessage(conversationId, text, token);
    }

    const response = await getHistory(conversationId, "?limit=2", token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].content).toBe("три");
    expect(body.messages[1].content).toBe("два");
    expect(body.nextCursor).toBe(body.messages[1].id);
  });

  it("paginates with the before cursor", async () => {
    const token = await signAccessToken(aliceId);
    for (const text of ["один", "два", "три"]) {
      await sendMessage(conversationId, text, token);
    }

    const firstPage = await getHistory(conversationId, "?limit=2", token);
    const firstBody = await firstPage.json();

    const secondPage = await getHistory(
      conversationId,
      `?limit=2&before=${firstBody.nextCursor}`,
      token,
    );
    const secondBody = await secondPage.json();

    expect(secondBody.messages).toHaveLength(1);
    expect(secondBody.messages[0].content).toBe("один");
    expect(secondBody.nextCursor).toBeNull();
  });

  it("returns 400 validation_error for an invalid cursor", async () => {
    const token = await signAccessToken(aliceId);
    const response = await getHistory(
      conversationId,
      "?before=not-a-uuid",
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 400 validation_error for a cursor from a different conversation", async () => {
    const token = await signAccessToken(aliceId);
    const otherConversation = await prisma.conversation.create({
      data: {
        type: "direct",
        participants: { create: [{ userId: aliceId }, { userId: carolId }] },
      },
    });
    const foreignMessage = await prisma.message.create({
      data: {
        conversationId: otherConversation.id,
        senderId: aliceId,
        content: "з іншої розмови",
      },
    });

    const response = await getHistory(
      conversationId,
      `?before=${foreignMessage.id}`,
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");

    await prisma.message.deleteMany({
      where: { conversationId: otherConversation.id },
    });
    await prisma.conversationParticipant.deleteMany({
      where: { conversationId: otherConversation.id },
    });
    await prisma.conversation.delete({ where: { id: otherConversation.id } });
  });

  it("returns 404 not_found for a non-participant", async () => {
    const token = await signAccessToken(carolId);
    const response = await getHistory(conversationId, "", token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await getHistory(conversationId, "");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
