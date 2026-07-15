import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { POST } from "./route";

const PREFIX = "grp_c_";

function createGroup(body: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request("http://localhost/api/conversations/group", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

let aliceId: string;
let bobId: string;
let carolId: string;
let createdConversationIds: string[] = [];

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
    where: { id: { in: [aliceId, bobId, carolId] } },
  });
});

describe("POST /api/conversations/group", () => {
  it("creates a group with the creator as admin and others as members", async () => {
    const token = await signAccessToken(aliceId);
    const response = await createGroup(
      { title: "Мандрівники", usernames: [`${PREFIX}bob`, `${PREFIX}carol`] },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    createdConversationIds.push(body.conversation.id);

    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId: body.conversation.id },
    });
    expect(participants).toHaveLength(3);
    expect(participants.find((p) => p.userId === aliceId)?.role).toBe("admin");
    expect(participants.find((p) => p.userId === bobId)?.role).toBe("member");
    expect(participants.find((p) => p.userId === carolId)?.role).toBe("member");

    const conversation = await prisma.conversation.findUnique({
      where: { id: body.conversation.id },
    });
    expect(conversation?.type).toBe("group");
    expect(conversation?.title).toBe("Мандрівники");
  });

  it("returns 400 validation_error for fewer than 2 invitees", async () => {
    const token = await signAccessToken(aliceId);
    const response = await createGroup(
      { title: "Мандрівники", usernames: [`${PREFIX}bob`] },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 400 validation_error for a missing title", async () => {
    const token = await signAccessToken(aliceId);
    const response = await createGroup(
      { usernames: [`${PREFIX}bob`, `${PREFIX}carol`] },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 404 not_found for a nonexistent username", async () => {
    const token = await signAccessToken(aliceId);
    const response = await createGroup(
      { title: "Мандрівники", usernames: [`${PREFIX}bob`, `${PREFIX}nobody`] },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await createGroup({
      title: "Мандрівники",
      usernames: [`${PREFIX}bob`, `${PREFIX}carol`],
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
