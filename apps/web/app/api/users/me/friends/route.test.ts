import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { GET } from "./route";

const PREFIX = "friends_list_test_";

function listFriends(accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(new Request("http://localhost/api/users/me/friends", { headers }));
}

let aliceId: string;
let bobId: string;
let carolId: string;
let deanId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [alice, bob, carol, dean] = await Promise.all([
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
    prisma.user.create({
      data: {
        email: `${PREFIX}dean@example.com`,
        username: `${PREFIX}dean`,
        passwordHash,
        isActive: false,
      },
    }),
  ]);
  aliceId = alice.id;
  bobId = bob.id;
  carolId = carol.id;
  deanId = dean.id;
});

afterEach(async () => {
  await prisma.friendship.deleteMany({
    where: { OR: [{ requesterId: aliceId }, { addresseeId: aliceId }] },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [aliceId, bobId, carolId, deanId] } },
  });
});

describe("GET /api/users/me/friends", () => {
  it("lists accepted friends regardless of who was the requester", async () => {
    await prisma.friendship.create({
      data: { requesterId: aliceId, addresseeId: bobId, status: "accepted" },
    });
    await prisma.friendship.create({
      data: { requesterId: carolId, addresseeId: aliceId, status: "accepted" },
    });
    const token = await signAccessToken(aliceId);
    const response = await listFriends(token);
    const body = await response.json();

    expect(response.status).toBe(200);
    const usernames = body.friends.map((f: { username: string }) => f.username);
    expect(usernames).toContain(`${PREFIX}bob`);
    expect(usernames).toContain(`${PREFIX}carol`);
    expect(usernames).toHaveLength(2);
  });

  it("excludes pending and blocked relationships", async () => {
    await prisma.friendship.create({
      data: { requesterId: aliceId, addresseeId: bobId, status: "pending" },
    });
    await prisma.friendship.create({
      data: { requesterId: aliceId, addresseeId: carolId, status: "blocked" },
    });
    const token = await signAccessToken(aliceId);
    const response = await listFriends(token);
    const body = await response.json();

    expect(body.friends).toHaveLength(0);
  });

  it("excludes deactivated friends", async () => {
    await prisma.friendship.create({
      data: { requesterId: aliceId, addresseeId: deanId, status: "accepted" },
    });
    const token = await signAccessToken(aliceId);
    const response = await listFriends(token);
    const body = await response.json();

    expect(body.friends).toHaveLength(0);
  });

  it("returns 401 without a token", async () => {
    const response = await listFriends();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
