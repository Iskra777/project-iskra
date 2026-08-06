import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { DELETE, GET, PATCH } from "./route";

const PREFIX = "projectid_";

function getProject(projectId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(
    new Request(`http://localhost/api/projects/${projectId}`, { headers }),
    { params: Promise.resolve({ id: projectId }) },
  );
}

function editProject(projectId: string, body: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return PATCH(
    new Request(`http://localhost/api/projects/${projectId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: projectId }) },
  );
}

function removeProject(projectId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return DELETE(
    new Request(`http://localhost/api/projects/${projectId}`, {
      method: "DELETE",
      headers,
    }),
    { params: Promise.resolve({ id: projectId }) },
  );
}

let ownerId: string;
let memberId: string;
let strangerId: string;
let projectId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [owner, member, stranger] = await Promise.all([
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
  ]);
  ownerId = owner.id;
  memberId = member.id;
  strangerId = stranger.id;

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
    where: { userId: { in: [ownerId, memberId, strangerId] } },
  });
  await prisma.project.deleteMany({
    where: { ownerId: { in: [ownerId, memberId, strangerId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [ownerId, memberId, strangerId] } },
  });
});

describe("GET /api/projects/:id", () => {
  it("returns the project with members and viewerRole to a member", async () => {
    const token = await signAccessToken(memberId);
    const response = await getProject(projectId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.project.id).toBe(projectId);
    expect(body.project.title).toBe("Community garden");
    expect(body.project.viewerRole).toBe("member");
    expect(body.project.members).toHaveLength(2);
    expect(
      body.project.members.map((m: { role: string }) => m.role).sort(),
    ).toEqual(["admin", "member"]);
  });

  it("returns 404 not_found for a non-member (anti-enumeration)", async () => {
    const token = await signAccessToken(strangerId);
    const response = await getProject(projectId, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 404 not_found for a missing project", async () => {
    const token = await signAccessToken(ownerId);
    const response = await getProject(crypto.randomUUID(), token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await getProject(projectId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("PATCH /api/projects/:id", () => {
  it("lets an admin member edit the project", async () => {
    const token = await signAccessToken(ownerId);
    const response = await editProject(
      projectId,
      { title: "Community garden, phase 2", status: "active" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.project.title).toBe("Community garden, phase 2");
    expect(body.project.status).toBe("active");
  });

  it("returns 403 forbidden for a plain member", async () => {
    const token = await signAccessToken(memberId);
    const response = await editProject(projectId, { title: "Hijacked" }, token);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 404 not_found for a non-member (anti-enumeration)", async () => {
    const token = await signAccessToken(strangerId);
    const response = await editProject(projectId, { title: "Hijacked" }, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await editProject(projectId, { title: "New title" });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("DELETE /api/projects/:id", () => {
  it("lets the owner delete the project", async () => {
    const token = await signAccessToken(ownerId);
    const response = await removeProject(projectId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    expect(project).toBeNull();

    const members = await prisma.projectMember.findMany({
      where: { projectId },
    });
    expect(members).toEqual([]);
  });

  it("returns 403 forbidden for an admin member who isn't the owner", async () => {
    await prisma.projectMember.update({
      where: { projectId_userId: { projectId, userId: memberId } },
      data: { role: "admin" },
    });

    const token = await signAccessToken(memberId);
    const response = await removeProject(projectId, token);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 404 not_found for a non-member (anti-enumeration)", async () => {
    const token = await signAccessToken(strangerId);
    const response = await removeProject(projectId, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await removeProject(projectId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
