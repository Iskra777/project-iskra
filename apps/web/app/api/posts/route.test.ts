import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { POST } from "./route";

const PREFIX = "post_create_";

function createPostRequest(body: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request("http://localhost/api/posts", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

let aliceId: string;
let bobId: string;
let publicCommunityId: string;
let privateCommunityId: string;
let createdPostIds: string[] = [];

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [alice, bob] = await Promise.all([
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
  aliceId = alice.id;
  bobId = bob.id;

  const publicCommunity = await prisma.community.create({
    data: {
      ownerId: aliceId,
      name: `${PREFIX}public`,
      visibility: "public",
      members: {
        create: [{ userId: aliceId, role: "admin", status: "approved" }],
      },
    },
  });
  publicCommunityId = publicCommunity.id;

  const privateCommunity = await prisma.community.create({
    data: {
      ownerId: aliceId,
      name: `${PREFIX}private`,
      visibility: "private",
      members: {
        create: [
          { userId: aliceId, role: "admin", status: "approved" },
          { userId: bobId, role: "member", status: "pending" },
        ],
      },
    },
  });
  privateCommunityId = privateCommunity.id;

  createdPostIds = [];
});

afterEach(async () => {
  await prisma.post.deleteMany({ where: { id: { in: createdPostIds } } });
  const communityIds = [publicCommunityId, privateCommunityId];
  await prisma.communityMember.deleteMany({
    where: { communityId: { in: communityIds } },
  });
  await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
  await prisma.user.deleteMany({ where: { id: { in: [aliceId, bobId] } } });
});

describe("POST /api/posts", () => {
  it("creates a profile post when communityId is omitted", async () => {
    const token = await signAccessToken(aliceId);
    const response = await createPostRequest(
      { content: "Hello, profile!" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    createdPostIds.push(body.post.id);

    const post = await prisma.post.findUnique({ where: { id: body.post.id } });
    expect(post?.authorId).toBe(aliceId);
    expect(post?.communityId).toBeNull();
    expect(post?.content).toBe("Hello, profile!");
  });

  it("creates a post with a mediaUrl", async () => {
    const token = await signAccessToken(aliceId);
    const response = await createPostRequest(
      { content: "With a picture", mediaUrl: "https://example.com/photo.webp" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    createdPostIds.push(body.post.id);

    const post = await prisma.post.findUnique({ where: { id: body.post.id } });
    expect(post?.mediaUrl).toBe("https://example.com/photo.webp");
  });

  it("returns 400 validation_error for a malformed mediaUrl", async () => {
    const token = await signAccessToken(aliceId);
    const response = await createPostRequest(
      { content: "Bad url", mediaUrl: "not-a-url" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("creates a community post for an approved member", async () => {
    const token = await signAccessToken(aliceId);
    const response = await createPostRequest(
      { content: "Hello, community!", communityId: publicCommunityId },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    createdPostIds.push(body.post.id);

    const post = await prisma.post.findUnique({ where: { id: body.post.id } });
    expect(post?.communityId).toBe(publicCommunityId);
  });

  it("returns 403 forbidden for a non-member posting to a community", async () => {
    const token = await signAccessToken(bobId);
    const response = await createPostRequest(
      { content: "I don't belong here", communityId: publicCommunityId },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 403 forbidden for a pending applicant posting to a private community", async () => {
    const token = await signAccessToken(bobId);
    const response = await createPostRequest(
      { content: "Still pending", communityId: privateCommunityId },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 404 community_not_found for a nonexistent community", async () => {
    const token = await signAccessToken(aliceId);
    const response = await createPostRequest(
      {
        content: "Nowhere",
        communityId: "00000000-0000-0000-0000-000000000000",
      },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("community_not_found");
  });

  it("returns 400 validation_error for empty content", async () => {
    const token = await signAccessToken(aliceId);
    const response = await createPostRequest({ content: "   " }, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 400 validation_error for content over 5000 characters", async () => {
    const token = await signAccessToken(aliceId);
    const response = await createPostRequest(
      { content: "a".repeat(5001) },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await createPostRequest({ content: "No auth" });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
