import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { POST, PATCH } from "./route";

const PREFIX = "friend_req_test_";

function sendRequest(username: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request(`http://localhost/api/users/${username}/friend-request`, {
      method: "POST",
      headers,
    }),
    { params: Promise.resolve({ username }) },
  );
}

function respondToRequest(
  username: string,
  action: unknown,
  accessToken?: string,
) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return PATCH(
    new Request(`http://localhost/api/users/${username}/friend-request`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ action }),
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

describe("POST /api/users/:username/friend-request", () => {
  it("creates a pending friendship", async () => {
    const token = await signAccessToken(aliceId);
    const response = await sendRequest(`${PREFIX}bob`, token);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);

    const friendship = await prisma.friendship.findFirst({
      where: { requesterId: aliceId, addresseeId: bobId },
    });
    expect(friendship?.status).toBe("pending");
  });

  it("returns 401 without a token", async () => {
    const response = await sendRequest(`${PREFIX}bob`);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });

  it("returns 404 for a nonexistent username", async () => {
    const token = await signAccessToken(aliceId);
    const response = await sendRequest(`${PREFIX}nobody`, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 400 cannot_friend_self when targeting yourself", async () => {
    const token = await signAccessToken(aliceId);
    const response = await sendRequest(`${PREFIX}alice`, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("cannot_friend_self");
  });

  it("returns 409 request_already_pending on a duplicate request", async () => {
    const token = await signAccessToken(aliceId);
    await sendRequest(`${PREFIX}bob`, token);
    const response = await sendRequest(`${PREFIX}bob`, token);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("request_already_pending");
  });

  it("returns 409 already_friends when the friendship is already accepted", async () => {
    await prisma.friendship.create({
      data: { requesterId: aliceId, addresseeId: bobId, status: "accepted" },
    });
    const token = await signAccessToken(aliceId);
    const response = await sendRequest(`${PREFIX}bob`, token);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("already_friends");
  });

  it("returns 403 blocked when a blocked relationship exists in either direction", async () => {
    await prisma.friendship.create({
      data: { requesterId: bobId, addresseeId: aliceId, status: "blocked" },
    });
    const token = await signAccessToken(aliceId);
    const response = await sendRequest(`${PREFIX}bob`, token);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("blocked");
  });
});

describe("PATCH /api/users/:username/friend-request", () => {
  it("accepts a pending request", async () => {
    await prisma.friendship.create({
      data: { requesterId: aliceId, addresseeId: bobId, status: "pending" },
    });
    const bobToken = await signAccessToken(bobId);
    const response = await respondToRequest(
      `${PREFIX}alice`,
      "accept",
      bobToken,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const friendship = await prisma.friendship.findFirst({
      where: { requesterId: aliceId, addresseeId: bobId },
    });
    expect(friendship?.status).toBe("accepted");
  });

  it("rejects a pending request by deleting the row", async () => {
    await prisma.friendship.create({
      data: { requesterId: aliceId, addresseeId: bobId, status: "pending" },
    });
    const bobToken = await signAccessToken(bobId);
    const response = await respondToRequest(
      `${PREFIX}alice`,
      "reject",
      bobToken,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const friendship = await prisma.friendship.findFirst({
      where: { requesterId: aliceId, addresseeId: bobId },
    });
    expect(friendship).toBeNull();
  });

  it("returns 401 without a token", async () => {
    const response = await respondToRequest(`${PREFIX}alice`, "accept");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });

  it("returns 400 validation_error for an invalid action", async () => {
    const bobToken = await signAccessToken(bobId);
    const response = await respondToRequest(
      `${PREFIX}alice`,
      "smash",
      bobToken,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 404 friend_request_not_found when there is no pending request", async () => {
    const bobToken = await signAccessToken(bobId);
    const response = await respondToRequest(
      `${PREFIX}alice`,
      "accept",
      bobToken,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("friend_request_not_found");
  });

  it("does not allow responding to someone else's request as a bystander", async () => {
    await prisma.friendship.create({
      data: { requesterId: aliceId, addresseeId: bobId, status: "pending" },
    });
    // Аліса намагається "прийняти" власний запит, видаючи себе за адресата.
    const aliceToken = await signAccessToken(aliceId);
    const response = await respondToRequest(
      `${PREFIX}alice`,
      "accept",
      aliceToken,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("friend_request_not_found");
  });
});
