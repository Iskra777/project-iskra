import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { DELETE } from "./route";

const PREFIX = "friendship_del_test_";

function removeFriendshipRequest(username: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return DELETE(
    new Request(`http://localhost/api/users/${username}/friendship`, {
      method: "DELETE",
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

describe("DELETE /api/users/:username/friendship", () => {
  it("removes an accepted friendship (unfriend)", async () => {
    await prisma.friendship.create({
      data: { requesterId: aliceId, addresseeId: bobId, status: "accepted" },
    });
    const token = await signAccessToken(aliceId);
    const response = await removeFriendshipRequest(`${PREFIX}bob`, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    const row = await prisma.friendship.findFirst({
      where: { requesterId: aliceId, addresseeId: bobId },
    });
    expect(row).toBeNull();
  });

  it("lets the requester cancel their own pending request", async () => {
    await prisma.friendship.create({
      data: { requesterId: aliceId, addresseeId: bobId, status: "pending" },
    });
    const token = await signAccessToken(aliceId);
    const response = await removeFriendshipRequest(`${PREFIX}bob`, token);

    expect(response.status).toBe(200);
    const row = await prisma.friendship.findFirst({
      where: { requesterId: aliceId, addresseeId: bobId },
    });
    expect(row).toBeNull();
  });

  it("lets the blocker unblock", async () => {
    await prisma.friendship.create({
      data: { requesterId: aliceId, addresseeId: bobId, status: "blocked" },
    });
    const token = await signAccessToken(aliceId);
    const response = await removeFriendshipRequest(`${PREFIX}bob`, token);

    expect(response.status).toBe(200);
    const row = await prisma.friendship.findFirst({
      where: { requesterId: aliceId, addresseeId: bobId },
    });
    expect(row).toBeNull();
  });

  it("returns 403 cannot_unblock when the blocked party tries to remove it", async () => {
    await prisma.friendship.create({
      data: { requesterId: aliceId, addresseeId: bobId, status: "blocked" },
    });
    const bobToken = await signAccessToken(bobId);
    const response = await removeFriendshipRequest(`${PREFIX}alice`, bobToken);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("cannot_unblock");

    const row = await prisma.friendship.findFirst({
      where: { requesterId: aliceId, addresseeId: bobId },
    });
    expect(row).not.toBeNull();
  });

  it("returns 404 friendship_not_found when there is no relationship", async () => {
    const token = await signAccessToken(aliceId);
    const response = await removeFriendshipRequest(`${PREFIX}bob`, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("friendship_not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await removeFriendshipRequest(`${PREFIX}bob`);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
