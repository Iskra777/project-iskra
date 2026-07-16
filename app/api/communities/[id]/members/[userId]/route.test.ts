import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { PATCH } from "./route";

const PREFIX = "comm_m_";

function respond(
  communityId: string,
  targetUserId: string,
  action: unknown,
  accessToken?: string,
) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return PATCH(
    new Request(
      `http://localhost/api/communities/${communityId}/members/${targetUserId}`,
      { method: "PATCH", headers, body: JSON.stringify({ action }) },
    ),
    { params: Promise.resolve({ id: communityId, userId: targetUserId }) },
  );
}

let ownerId: string;
let modId: string;
let memberId: string;
let applicantId: string;
let communityId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [owner, mod, member, applicant] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}owner@example.com`,
        username: `${PREFIX}owner`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}mod@example.com`,
        username: `${PREFIX}mod`,
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
        email: `${PREFIX}applicant@example.com`,
        username: `${PREFIX}applicant`,
        passwordHash,
      },
    }),
  ]);
  ownerId = owner.id;
  modId = mod.id;
  memberId = member.id;
  applicantId = applicant.id;

  const community = await prisma.community.create({
    data: {
      ownerId,
      name: `${PREFIX}club`,
      visibility: "private",
      members: {
        create: [
          { userId: ownerId, role: "admin", status: "approved" },
          { userId: modId, role: "moderator", status: "approved" },
          { userId: memberId, role: "member", status: "approved" },
          { userId: applicantId, role: "member", status: "pending" },
        ],
      },
    },
  });
  communityId = community.id;
});

afterEach(async () => {
  await prisma.communityMember.deleteMany({ where: { communityId } });
  await prisma.community.deleteMany({ where: { id: communityId } });
  await prisma.user.deleteMany({
    where: { id: { in: [ownerId, modId, memberId, applicantId] } },
  });
});

describe("PATCH /api/communities/:id/members/:userId", () => {
  it("admin approves a pending request", async () => {
    const token = await signAccessToken(ownerId);
    const response = await respond(communityId, applicantId, "approve", token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId: applicantId } },
    });
    expect(membership?.status).toBe("approved");
  });

  it("moderator rejects a pending request, removing it", async () => {
    const token = await signAccessToken(modId);
    const response = await respond(communityId, applicantId, "reject", token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const membership = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId: applicantId } },
    });
    expect(membership).toBeNull();
  });

  it("returns 403 forbidden for a regular member", async () => {
    const token = await signAccessToken(memberId);
    const response = await respond(communityId, applicantId, "approve", token);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 404 no_pending_request for a non-pending target", async () => {
    const token = await signAccessToken(ownerId);
    const response = await respond(communityId, memberId, "approve", token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("no_pending_request");
  });

  it("returns 400 validation_error for an invalid action", async () => {
    const token = await signAccessToken(ownerId);
    const response = await respond(communityId, applicantId, "banish", token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await respond(communityId, applicantId, "approve");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
