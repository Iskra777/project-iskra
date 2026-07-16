import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { GET } from "./route";

const PREFIX = "feed_";

function getFeed(query: Record<string, string> = {}, accessToken?: string) {
  const url = new URL("http://localhost/api/feed");
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(new Request(url, { headers }));
}

let viewerId: string;
let friendId: string;
let strangerId: string;
let communityMemberId: string;
let communityId: string;
let privateCommunityId: string;
let createdPostIds: string[] = [];

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [viewer, friend, stranger, communityMember] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}viewer@example.com`,
        username: `${PREFIX}viewer`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}friend@example.com`,
        username: `${PREFIX}friend`,
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
        email: `${PREFIX}commember@example.com`,
        username: `${PREFIX}commember`,
        passwordHash,
      },
    }),
  ]);
  viewerId = viewer.id;
  friendId = friend.id;
  strangerId = stranger.id;
  communityMemberId = communityMember.id;

  await prisma.friendship.create({
    data: { requesterId: viewerId, addresseeId: friendId, status: "accepted" },
  });

  const community = await prisma.community.create({
    data: {
      ownerId: viewerId,
      name: `${PREFIX}public_club`,
      visibility: "public",
      members: {
        create: [
          { userId: viewerId, role: "admin", status: "approved" },
          { userId: communityMemberId, role: "member", status: "approved" },
        ],
      },
    },
  });
  communityId = community.id;

  const privateCommunity = await prisma.community.create({
    data: {
      ownerId: strangerId,
      name: `${PREFIX}private_club`,
      visibility: "private",
      members: {
        create: [{ userId: strangerId, role: "admin", status: "approved" }],
      },
    },
  });
  privateCommunityId = privateCommunity.id;

  createdPostIds = [];
});

afterEach(async () => {
  await prisma.post.deleteMany({ where: { id: { in: createdPostIds } } });
  const communityIds = [communityId, privateCommunityId];
  await prisma.communityMember.deleteMany({
    where: { communityId: { in: communityIds } },
  });
  await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
  await prisma.friendship.deleteMany({
    where: { requesterId: viewerId, addresseeId: friendId },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [viewerId, friendId, strangerId, communityMemberId] } },
  });
});

async function makePost(
  authorId: string,
  content: string,
  communityIdForPost: string | null = null,
) {
  const post = await prisma.post.create({
    data: { authorId, content, communityId: communityIdForPost },
  });
  createdPostIds.push(post.id);
  return post;
}

describe("GET /api/feed", () => {
  it("includes the viewer's own profile posts", async () => {
    await makePost(viewerId, "My own post");
    const token = await signAccessToken(viewerId);
    const response = await getFeed({}, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(
      body.posts.some((p: { content: string }) => p.content === "My own post"),
    ).toBe(true);
  });

  it("includes an accepted friend's profile posts", async () => {
    await makePost(friendId, "Friend's post");
    const token = await signAccessToken(viewerId);
    const response = await getFeed({}, token);
    const body = await response.json();

    expect(
      body.posts.some(
        (p: { content: string }) => p.content === "Friend's post",
      ),
    ).toBe(true);
  });

  it("excludes a non-friend stranger's profile posts", async () => {
    await makePost(strangerId, "Stranger's post");
    const token = await signAccessToken(viewerId);
    const response = await getFeed({}, token);
    const body = await response.json();

    expect(
      body.posts.some(
        (p: { content: string }) => p.content === "Stranger's post",
      ),
    ).toBe(false);
  });

  it("includes posts from a community the viewer belongs to, from any member", async () => {
    await makePost(communityMemberId, "Community post", communityId);
    const token = await signAccessToken(viewerId);
    const response = await getFeed({}, token);
    const body = await response.json();

    expect(
      body.posts.some(
        (p: { content: string }) => p.content === "Community post",
      ),
    ).toBe(true);
  });

  it("excludes posts from a private community the viewer is not a member of, even from a friend", async () => {
    await prisma.communityMember.create({
      data: {
        communityId: privateCommunityId,
        userId: friendId,
        role: "member",
        status: "approved",
      },
    });
    await makePost(
      friendId,
      "Friend's private community post",
      privateCommunityId,
    );
    const token = await signAccessToken(viewerId);
    const response = await getFeed({}, token);
    const body = await response.json();

    expect(
      body.posts.some(
        (p: { content: string }) =>
          p.content === "Friend's private community post",
      ),
    ).toBe(false);
  });

  it("excludes soft-deleted posts", async () => {
    const post = await makePost(viewerId, "Will be deleted");
    await prisma.post.update({
      where: { id: post.id },
      data: { deletedAt: new Date() },
    });
    const token = await signAccessToken(viewerId);
    const response = await getFeed({}, token);
    const body = await response.json();

    expect(
      body.posts.some(
        (p: { content: string }) => p.content === "Will be deleted",
      ),
    ).toBe(false);
  });

  it("paginates with a cursor, newest first", async () => {
    const first = await makePost(viewerId, "First");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await makePost(viewerId, "Second");

    const token = await signAccessToken(viewerId);
    const page1 = await getFeed({ limit: "1" }, token);
    const page1Body = await page1.json();

    expect(page1Body.posts).toHaveLength(1);
    expect(page1Body.posts[0].id).toBe(second.id);
    expect(page1Body.nextCursor).toBe(second.id);

    const page2 = await getFeed(
      { limit: "1", before: page1Body.nextCursor },
      token,
    );
    const page2Body = await page2.json();

    expect(page2Body.posts).toHaveLength(1);
    expect(page2Body.posts[0].id).toBe(first.id);
  });

  it("returns 400 validation_error for an invalid cursor", async () => {
    const token = await signAccessToken(viewerId);
    const response = await getFeed(
      { before: "00000000-0000-0000-0000-000000000000" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await getFeed();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
