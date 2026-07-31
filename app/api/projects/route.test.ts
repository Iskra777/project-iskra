import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { GET, POST } from "./route";

const PREFIX = "project_";

function createProject(body: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request("http://localhost/api/projects", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

function listProjects(accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(new Request("http://localhost/api/projects", { headers }));
}

let userId: string;
let otherUserId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [user, otherUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}user@example.com`,
        username: `${PREFIX}user`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}other@example.com`,
        username: `${PREFIX}other`,
        passwordHash,
      },
    }),
  ]);
  userId = user.id;
  otherUserId = otherUser.id;
});

afterEach(async () => {
  await prisma.projectMember.deleteMany({
    where: { userId: { in: [userId, otherUserId] } },
  });
  await prisma.project.deleteMany({
    where: { ownerId: { in: [userId, otherUserId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [userId, otherUserId] } },
  });
});

describe("POST /api/projects", () => {
  it("creates a project and makes the owner an admin member", async () => {
    const token = await signAccessToken(userId);
    const response = await createProject({ title: "Community garden" }, token);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.project.title).toBe("Community garden");
    expect(body.project.status).toBe("planning");
    expect(body.project.description).toBeNull();
    expect(body.project.ownerId).toBe(userId);

    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: body.project.id, userId } },
    });
    expect(membership?.role).toBe("admin");
  });

  it("accepts a description", async () => {
    const token = await signAccessToken(userId);
    const response = await createProject(
      { title: "Community garden", description: "Weekly weeding" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.project.description).toBe("Weekly weeding");
  });

  it("returns 400 validation_error for an empty title", async () => {
    const token = await signAccessToken(userId);
    const response = await createProject({ title: "  " }, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await createProject({ title: "Community garden" });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("GET /api/projects", () => {
  it("lists only projects the viewer owns or is a member of", async () => {
    const first = await prisma.project.create({
      data: {
        ownerId: userId,
        title: "First project",
        members: { create: [{ userId, role: "admin" }] },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await prisma.project.create({
      data: {
        ownerId: otherUserId,
        title: "Second project",
        members: {
          create: [
            { userId: otherUserId, role: "admin" },
            { userId, role: "member" },
          ],
        },
      },
    });
    await prisma.project.create({
      data: {
        ownerId: otherUserId,
        title: "Not mine",
        members: { create: [{ userId: otherUserId, role: "admin" }] },
      },
    });

    const token = await signAccessToken(userId);
    const response = await listProjects(token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projects.map((p: { id: string }) => p.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it("returns an empty list when the viewer has no projects", async () => {
    const token = await signAccessToken(userId);
    const response = await listProjects(token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projects).toEqual([]);
  });

  it("returns 401 without a token", async () => {
    const response = await listProjects();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
