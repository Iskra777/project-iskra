import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { POST } from "./route";

const PREFIX = "comm_j_";

function joinCommunity(communityId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request(`http://localhost/api/communities/${communityId}/join`, {
      method: "POST",
      headers,
    }),
    { params: Promise.resolve({ id: communityId }) },
  );
}

let ownerId: string;
let aliceId: string;
let publicCommunityId: string;
let privateCommunityId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [owner, alice] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}owner@example.com`,
        username: `${PREFIX}owner`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}alice@example.com`,
        username: `${PREFIX}alice`,
        passwordHash,
      },
    }),
  ]);
  ownerId = owner.id;
  aliceId = alice.id;

  const publicCommunity = await prisma.community.create({
    data: {
      ownerId,
      name: `${PREFIX}public`,
      visibility: "public",
      members: {
        create: [{ userId: ownerId, role: "admin", status: "approved" }],
      },
    },
  });
  publicCommunityId = publicCommunity.id;

  const privateCommunity = await prisma.community.create({
    data: {
      ownerId,
      name: `${PREFIX}private`,
      visibility: "private",
      members: {
        create: [{ userId: ownerId, role: "admin", status: "approved" }],
      },
    },
  });
  privateCommunityId = privateCommunity.id;
});

afterEach(async () => {
  const communityIds = [publicCommunityId, privateCommunityId];
  await prisma.communityMember.deleteMany({
    where: { communityId: { in: communityIds } },
  });
  await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, aliceId] } } });
});

describe("POST /api/communities/:id/join", () => {
  it("joins a public community as approved immediately", async () => {
    const token = await signAccessToken(aliceId);
    const response = await joinCommunity(publicCommunityId, token);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.status).toBe("approved");

    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: { communityId: publicCommunityId, userId: aliceId },
      },
    });
    expect(membership?.status).toBe("approved");
    expect(membership?.role).toBe("member");
  });

  it("requests to join a private community as pending", async () => {
    const token = await signAccessToken(aliceId);
    const response = await joinCommunity(privateCommunityId, token);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.status).toBe("pending");

    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: privateCommunityId,
          userId: aliceId,
        },
      },
    });
    expect(membership?.status).toBe("pending");
  });

  it("returns 409 already_member for a second join attempt", async () => {
    const token = await signAccessToken(aliceId);
    await joinCommunity(publicCommunityId, token);
    const response = await joinCommunity(publicCommunityId, token);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("already_member");
  });

  it("returns 404 not_found for a nonexistent community", async () => {
    const token = await signAccessToken(aliceId);
    const response = await joinCommunity(
      "00000000-0000-0000-0000-000000000000",
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await joinCommunity(publicCommunityId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
