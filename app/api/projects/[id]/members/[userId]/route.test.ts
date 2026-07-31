import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { DELETE, PATCH } from "./route";

const PREFIX = "project_member_id_";

function changeRole(
  projectId: string,
  targetUserId: string,
  role: unknown,
  accessToken?: string,
) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return PATCH(
    new Request(
      `http://localhost/api/projects/${projectId}/members/${targetUserId}`,
      { method: "PATCH", headers, body: JSON.stringify({ role }) },
    ),
    { params: Promise.resolve({ id: projectId, userId: targetUserId }) },
  );
}

function removeMember(
  projectId: string,
  targetUserId: string,
  accessToken?: string,
) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return DELETE(
    new Request(
      `http://localhost/api/projects/${projectId}/members/${targetUserId}`,
      { method: "DELETE", headers },
    ),
    { params: Promise.resolve({ id: projectId, userId: targetUserId }) },
  );
}

let ownerId: string;
let adminId: string;
let memberId: string;
let strangerId: string;
let projectId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [owner, admin, member, stranger] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}owner@example.com`,
        username: `${PREFIX}owner`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}admin@example.com`,
        username: `${PREFIX}admin`,
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
  ]);
  ownerId = owner.id;
  adminId = admin.id;
  memberId = member.id;
  strangerId = stranger.id;

  const project = await prisma.project.create({
    data: {
      ownerId,
      title: "Community garden",
      members: {
        create: [
          { userId: ownerId, role: "admin" },
          { userId: adminId, role: "admin" },
          { userId: memberId, role: "member" },
        ],
      },
    },
  });
  projectId = project.id;
});

afterEach(async () => {
  await prisma.projectMember.deleteMany({
    where: { userId: { in: [ownerId, adminId, memberId, strangerId] } },
  });
  await prisma.project.deleteMany({
    where: { ownerId: { in: [ownerId, adminId, memberId, strangerId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [ownerId, adminId, memberId, strangerId] } },
  });
});

describe("PATCH /api/projects/:id/members/:userId", () => {
  it("lets an admin change another member's role", async () => {
    const token = await signAccessToken(ownerId);
    const response = await changeRole(projectId, memberId, "admin", token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: memberId } },
    });
    expect(membership?.role).toBe("admin");
  });

  it("returns 400 cannot_change_owner_role for the owner", async () => {
    const token = await signAccessToken(adminId);
    const response = await changeRole(projectId, ownerId, "member", token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("cannot_change_owner_role");
  });

  it("returns 403 forbidden for a plain member", async () => {
    const token = await signAccessToken(memberId);
    const response = await changeRole(projectId, adminId, "member", token);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 404 target_not_member for a non-member target", async () => {
    const token = await signAccessToken(ownerId);
    const response = await changeRole(projectId, strangerId, "admin", token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("target_not_member");
  });

  it("returns 404 not_found for a non-member actor (anti-enumeration)", async () => {
    const token = await signAccessToken(strangerId);
    const response = await changeRole(projectId, memberId, "admin", token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await changeRole(projectId, memberId, "admin");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("DELETE /api/projects/:id/members/:userId", () => {
  it("lets an admin remove another member", async () => {
    const token = await signAccessToken(ownerId);
    const response = await removeMember(projectId, memberId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: memberId } },
    });
    expect(membership).toBeNull();
  });

  it("lets a member remove themselves (leave)", async () => {
    const token = await signAccessToken(memberId);
    const response = await removeMember(projectId, memberId, token);

    expect(response.status).toBe(200);

    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: memberId } },
    });
    expect(membership).toBeNull();
  });

  it("returns 400 owner_cannot_leave when the owner tries to remove themselves", async () => {
    const token = await signAccessToken(ownerId);
    const response = await removeMember(projectId, ownerId, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("owner_cannot_leave");
  });

  it("returns 403 forbidden when the owner is targeted by another admin", async () => {
    const token = await signAccessToken(adminId);
    const response = await removeMember(projectId, ownerId, token);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 403 forbidden for a plain member removing someone else", async () => {
    const token = await signAccessToken(memberId);
    const response = await removeMember(projectId, adminId, token);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 404 target_not_member for a non-member target", async () => {
    const token = await signAccessToken(ownerId);
    const response = await removeMember(projectId, strangerId, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("target_not_member");
  });

  it("returns 404 not_found for a non-member actor (anti-enumeration)", async () => {
    const token = await signAccessToken(strangerId);
    const response = await removeMember(projectId, memberId, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await removeMember(projectId, memberId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
