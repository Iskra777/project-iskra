import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { DELETE } from "./route";

const PREFIX = "comm_l_";

function leaveCommunity(
  communityId: string,
  body: unknown,
  accessToken?: string,
) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return DELETE(
    new Request(`http://localhost/api/communities/${communityId}/leave`, {
      method: "DELETE",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: communityId }) },
  );
}

let ownerId: string;
let aliceId: string;
let bobId: string;
let createdCommunityIds: string[] = [];

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [owner, alice, bob] = await Promise.all([
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
    prisma.user.create({
      data: {
        email: `${PREFIX}bob@example.com`,
        username: `${PREFIX}bob`,
        passwordHash,
      },
    }),
  ]);
  ownerId = owner.id;
  aliceId = alice.id;
  bobId = bob.id;
  createdCommunityIds = [];
});

afterEach(async () => {
  await prisma.communityMember.deleteMany({
    where: { communityId: { in: createdCommunityIds } },
  });
  await prisma.community.deleteMany({
    where: { id: { in: createdCommunityIds } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [ownerId, aliceId, bobId] } },
  });
});

async function makeCommunity(
  members: {
    userId: string;
    role: "admin" | "moderator" | "member";
    status: "approved" | "pending";
  }[],
) {
  const community = await prisma.community.create({
    data: {
      ownerId,
      name: `${PREFIX}${Math.random().toString(36).slice(2)}`,
      visibility: "public",
      members: { create: members },
    },
  });
  createdCommunityIds.push(community.id);
  return community.id;
}

describe("DELETE /api/communities/:id/leave", () => {
  it("a regular member leaves freely", async () => {
    const communityId = await makeCommunity([
      { userId: ownerId, role: "admin", status: "approved" },
      { userId: aliceId, role: "member", status: "approved" },
    ]);
    const token = await signAccessToken(aliceId);
    const response = await leaveCommunity(communityId, undefined, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId: aliceId } },
    });
    expect(membership).toBeNull();
  });

  it("returns 400 owner_required when the owner leaves without a successor", async () => {
    const communityId = await makeCommunity([
      { userId: ownerId, role: "admin", status: "approved" },
      { userId: aliceId, role: "member", status: "approved" },
    ]);
    const token = await signAccessToken(ownerId);
    const response = await leaveCommunity(communityId, undefined, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("owner_required");
  });

  it("transfers ownership and leaves when a valid successor is given", async () => {
    const communityId = await makeCommunity([
      { userId: ownerId, role: "admin", status: "approved" },
      { userId: aliceId, role: "member", status: "approved" },
    ]);
    const token = await signAccessToken(ownerId);
    const response = await leaveCommunity(
      communityId,
      { newOwnerId: aliceId },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const community = await prisma.community.findUnique({
      where: { id: communityId },
    });
    expect(community?.ownerId).toBe(aliceId);

    const aliceMembership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId: aliceId } },
    });
    expect(aliceMembership?.role).toBe("admin");

    const ownerMembership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId: ownerId } },
    });
    expect(ownerMembership).toBeNull();
  });

  it("returns 400 invalid_new_owner for a successor who isn't an approved member", async () => {
    const communityId = await makeCommunity([
      { userId: ownerId, role: "admin", status: "approved" },
      { userId: aliceId, role: "member", status: "pending" },
    ]);
    const token = await signAccessToken(ownerId);
    const response = await leaveCommunity(
      communityId,
      { newOwnerId: aliceId },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("invalid_new_owner");
  });

  it("returns 404 not_found for a non-member", async () => {
    const communityId = await makeCommunity([
      { userId: ownerId, role: "admin", status: "approved" },
    ]);
    const token = await signAccessToken(bobId);
    const response = await leaveCommunity(communityId, undefined, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const communityId = await makeCommunity([
      { userId: ownerId, role: "admin", status: "approved" },
    ]);
    const response = await leaveCommunity(communityId, undefined);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
