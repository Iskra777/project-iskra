import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { POST } from "./route";

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
