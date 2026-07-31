import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { POST } from "./route";

const PREFIX = "project_members_";

function addMembers(
  projectId: string,
  userIds: string[],
  accessToken?: string,
) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request(`http://localhost/api/projects/${projectId}/members`, {
      method: "POST",
      headers,
      body: JSON.stringify({ userIds }),
    }),
    { params: Promise.resolve({ id: projectId }) },
  );
}

let ownerId: string;
let memberId: string;
let strangerId: string;
let newUserId: string;
let projectId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [owner, member, stranger, newUser] = await Promise.all([
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
        email: `${PREFIX}stranger@example.com`,
        username: `${PREFIX}stranger`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}newuser@example.com`,
        username: `${PREFIX}newuser`,
        passwordHash,
      },
    }),
  ]);
  ownerId = owner.id;
  memberId = member.id;
  strangerId = stranger.id;
  newUserId = newUser.id;

  const project = await prisma.project.create({
    data: {
      ownerId,
      title: "Community garden",
      members: {
        create: [
          { userId: ownerId, role: "admin" },
          { userId: memberId, role: "member" },
        ],
      },
    },
  });
  projectId = project.id;
});

afterEach(async () => {
  await prisma.projectMember.deleteMany({
    where: { userId: { in: [ownerId, memberId, strangerId, newUserId] } },
  });
  await prisma.project.deleteMany({
    where: { ownerId: { in: [ownerId, memberId, strangerId, newUserId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [ownerId, memberId, strangerId, newUserId] } },
  });
});

describe("POST /api/projects/:id/members", () => {
  it("lets an admin add a new member", async () => {
    const token = await signAccessToken(ownerId);
    const response = await addMembers(projectId, [newUserId], token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: newUserId } },
    });
    expect(membership?.role).toBe("member");
  });

  it("is idempotent for an already-existing member", async () => {
    const token = await signAccessToken(ownerId);
    const response = await addMembers(projectId, [memberId], token);

    expect(response.status).toBe(200);

    const count = await prisma.projectMember.count({ where: { projectId } });
    expect(count).toBe(2);
  });

  it("returns 403 forbidden for a plain member", async () => {
    const token = await signAccessToken(memberId);
    const response = await addMembers(projectId, [newUserId], token);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 404 not_found for a non-member (anti-enumeration)", async () => {
    const token = await signAccessToken(strangerId);
    const response = await addMembers(projectId, [newUserId], token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 400 validation_error for an empty userIds list", async () => {
    const token = await signAccessToken(ownerId);
    const response = await addMembers(projectId, [], token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await addMembers(projectId, [newUserId]);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
