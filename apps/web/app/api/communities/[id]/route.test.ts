import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { GET } from "./route";

const PREFIX = "comm_g_";

function getCommunity(communityId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(
    new Request(`http://localhost/api/communities/${communityId}`, {
      headers,
    }),
    { params: Promise.resolve({ id: communityId }) },
  );
}

let ownerId: string;
let memberId: string;
let outsiderId: string;
let publicCommunityId: string;
let privateCommunityId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [owner, member, outsider] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}owner@example.com`,
        username: `${PREFIX}owner`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}member@example.com`,
        username: `${PREFIX}member`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}outsider@example.com`,
        username: `${PREFIX}outsider`,
        passwordHash,
      },
    }),
  ]);
  ownerId = owner.id;
  memberId = member.id;
  outsiderId = outsider.id;

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
        create: [
          { userId: ownerId, role: "admin", status: "approved" },
          { userId: memberId, role: "member", status: "approved" },
          { userId: outsiderId, role: "member", status: "pending" },
        ],
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
  await prisma.user.deleteMany({
    where: { id: { in: [ownerId, memberId, outsiderId] } },
  });
});

describe("GET /api/communities/:id", () => {
  it("shows members of a public community to an anonymous viewer", async () => {
    const response = await getCommunity(publicCommunityId);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.community.memberCount).toBe(1);
    expect(body.community.members).not.toBeNull();
    expect(body.community.viewerMembership).toBeNull();
    expect(body.community.pendingRequests).toBeNull();
  });

  it("hides the member list of a private community from a non-member", async () => {
    const token = await signAccessToken(outsiderId);
    const response = await getCommunity(privateCommunityId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.community.members).toBeNull();
    expect(body.community.viewerMembership).toEqual({
      role: "member",
      status: "pending",
    });
  });

  it("shows the member list of a private community to an approved member", async () => {
    const token = await signAccessToken(memberId);
    const response = await getCommunity(privateCommunityId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.community.members).toHaveLength(2);
    expect(body.community.viewerMembership).toEqual({
      role: "member",
      status: "approved",
    });
    expect(body.community.pendingRequests).toBeNull();
  });

  it("includes pending requests for an admin viewer", async () => {
    const token = await signAccessToken(ownerId);
    const response = await getCommunity(privateCommunityId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.community.pendingRequests).toHaveLength(1);
    expect(body.community.pendingRequests[0].id).toBe(outsiderId);
  });

  it("returns 404 not_found for a nonexistent community", async () => {
    const response = await getCommunity("00000000-0000-0000-0000-000000000000");
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });
});
