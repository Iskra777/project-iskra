import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { POST } from "./route";

const PREFIX = "block_test_";

function blockRequest(username: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request(`http://localhost/api/users/${username}/block`, {
      method: "POST",
      headers,
    }),
    { params: Promise.resolve({ username }) },
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
  await prisma.friendship.deleteMany({
    where: { OR: [{ requesterId: aliceId }, { addresseeId: aliceId }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: [aliceId, bobId] } } });
});

describe("POST /api/users/:username/block", () => {
  it("blocks a user with no prior relationship", async () => {
    const token = await signAccessToken(aliceId);
    const response = await blockRequest(`${PREFIX}bob`, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const row = await prisma.friendship.findFirst({
      where: { requesterId: aliceId, addresseeId: bobId },
    });
    expect(row?.status).toBe("blocked");
  });

  it("blocks and reassigns roles when the target was the original requester", async () => {
    await prisma.friendship.create({
      data: { requesterId: bobId, addresseeId: aliceId, status: "pending" },
    });
    const token = await signAccessToken(aliceId);
    const response = await blockRequest(`${PREFIX}bob`, token);

    expect(response.status).toBe(200);

    const row = await prisma.friendship.findFirst({
      where: { requesterId: aliceId, addresseeId: bobId },
    });
    expect(row?.status).toBe("blocked");

    const reversedRow = await prisma.friendship.findFirst({
      where: { requesterId: bobId, addresseeId: aliceId },
    });
    expect(reversedRow).toBeNull();
  });

  it("blocks an already-accepted friend", async () => {
    await prisma.friendship.create({
      data: { requesterId: aliceId, addresseeId: bobId, status: "accepted" },
    });
    const token = await signAccessToken(aliceId);
    const response = await blockRequest(`${PREFIX}bob`, token);

    expect(response.status).toBe(200);
    const row = await prisma.friendship.findFirst({
      where: { requesterId: aliceId, addresseeId: bobId },
    });
    expect(row?.status).toBe("blocked");
  });

  it("returns 400 cannot_block_self", async () => {
    const token = await signAccessToken(aliceId);
    const response = await blockRequest(`${PREFIX}alice`, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("cannot_block_self");
  });

  it("returns 409 already_blocked on a duplicate block", async () => {
    const token = await signAccessToken(aliceId);
    await blockRequest(`${PREFIX}bob`, token);
    const response = await blockRequest(`${PREFIX}bob`, token);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("already_blocked");
  });

  it("returns 404 for a nonexistent username", async () => {
    const token = await signAccessToken(aliceId);
    const response = await blockRequest(`${PREFIX}nobody`, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await blockRequest(`${PREFIX}bob`);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
