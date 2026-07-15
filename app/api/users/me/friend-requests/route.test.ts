import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { GET } from "./route";

const PREFIX = "friend_reqs_list_test_";

function listRequests(accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(
    new Request("http://localhost/api/users/me/friend-requests", { headers }),
  );
}

let aliceId: string;
let bobId: string;
let carolId: string;

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
        isActive: false,
      },
    }),
  ]);
  aliceId = alice.id;
  bobId = bob.id;
  carolId = carol.id;
});

afterEach(async () => {
  await prisma.friendship.deleteMany({
    where: { OR: [{ requesterId: aliceId }, { addresseeId: aliceId }] },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [aliceId, bobId, carolId] } },
  });
});

describe("GET /api/users/me/friend-requests", () => {
  it("lists incoming pending requests with requester info", async () => {
    await prisma.friendship.create({
      data: { requesterId: bobId, addresseeId: aliceId, status: "pending" },
    });
    const token = await signAccessToken(aliceId);
    const response = await listRequests(token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0].requester.username).toBe(`${PREFIX}bob`);
  });

  it("excludes requests from deactivated accounts", async () => {
    await prisma.friendship.create({
      data: { requesterId: carolId, addresseeId: aliceId, status: "pending" },
    });
    const token = await signAccessToken(aliceId);
    const response = await listRequests(token);
    const body = await response.json();

    expect(body.requests).toHaveLength(0);
  });

  it("does not include outgoing requests or accepted friendships", async () => {
    await prisma.friendship.create({
      data: { requesterId: aliceId, addresseeId: bobId, status: "pending" },
    });
    const token = await signAccessToken(aliceId);
    const response = await listRequests(token);
    const body = await response.json();

    expect(body.requests).toHaveLength(0);
  });

  it("returns 401 without a token", async () => {
    const response = await listRequests();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
