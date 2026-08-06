import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { GET } from "./route";

const PREFIX = "bkm_";

function getBookmarks(
  query: Record<string, string> = {},
  accessToken?: string,
) {
  const url = new URL("http://localhost/api/bookmarks");
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
let strangerId: string;
let communityId: string;
let createdPostIds: string[] = [];

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [viewer, stranger] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}viewer@example.com`,
        username: `${PREFIX}viewer`,
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
  viewerId = viewer.id;
  strangerId = stranger.id;

  const community = await prisma.community.create({
    data: {
      ownerId: strangerId,
      name: `${PREFIX}club`,
      visibility: "private",
      members: {
        create: [{ userId: strangerId, role: "admin", status: "approved" }],
      },
    },
  });
  communityId = community.id;

  createdPostIds = [];
});

afterEach(async () => {
  await prisma.bookmark.deleteMany({
    where: { userId: viewerId },
  });
  await prisma.postReaction.deleteMany({
    where: { postId: { in: createdPostIds } },
  });
  await prisma.post.deleteMany({ where: { id: { in: createdPostIds } } });
  await prisma.communityMember.deleteMany({ where: { communityId } });
  await prisma.community.deleteMany({ where: { id: communityId } });
  await prisma.user.deleteMany({
    where: { id: { in: [viewerId, strangerId] } },
  });
});

async function makePost(authorId: string, content: string) {
  const post = await prisma.post.create({ data: { authorId, content } });
  createdPostIds.push(post.id);
  return post;
}

async function bookmark(postId: string) {
  await prisma.bookmark.create({ data: { userId: viewerId, postId } });
}

describe("GET /api/bookmarks", () => {
  it("returns 401 without a token", async () => {
    const response = await getBookmarks();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });

  it("returns the viewer's bookmarked posts, newest bookmark first", async () => {
    const first = await makePost(viewerId, "First");
    await bookmark(first.id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await makePost(viewerId, "Second");
    await bookmark(second.id);

    const token = await signAccessToken(viewerId);
    const response = await getBookmarks({}, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.posts.map((p: { id: string }) => p.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it("includes the viewer's own reactions on each bookmarked post, not counts", async () => {
    const post = await makePost(viewerId, "React to me");
    await bookmark(post.id);
    await prisma.postReaction.create({
      data: { postId: post.id, userId: viewerId, type: "fire" },
    });

    const token = await signAccessToken(viewerId);
    const response = await getBookmarks({}, token);
    const body = await response.json();

    const found = body.posts.find((p: { id: string }) => p.id === post.id);
    expect(found.viewerReactions).toEqual(["fire"]);
    expect(found.reactionCount).toBeUndefined();
  });

  it("silently omits a bookmark whose post visibility has since been revoked", async () => {
    const post = await makePost(strangerId, "Stranger's community post");
    await prisma.post.update({
      where: { id: post.id },
      data: { communityId },
    });
    await bookmark(post.id);

    const token = await signAccessToken(viewerId);
    const response = await getBookmarks({}, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.posts).toHaveLength(0);
  });

  it("silently omits a bookmark whose post was soft-deleted", async () => {
    const post = await makePost(viewerId, "Will be deleted");
    await bookmark(post.id);
    await prisma.post.update({
      where: { id: post.id },
      data: { deletedAt: new Date() },
    });

    const token = await signAccessToken(viewerId);
    const response = await getBookmarks({}, token);
    const body = await response.json();

    expect(body.posts).toHaveLength(0);
  });

  it("paginates with a cursor", async () => {
    const first = await makePost(viewerId, "First");
    await bookmark(first.id);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await makePost(viewerId, "Second");
    await bookmark(second.id);

    const token = await signAccessToken(viewerId);
    const page1 = await getBookmarks({ limit: "1" }, token);
    const page1Body = await page1.json();

    expect(page1Body.posts).toHaveLength(1);
    expect(page1Body.posts[0].id).toBe(second.id);
    expect(page1Body.nextCursor).not.toBeNull();

    const page2 = await getBookmarks(
      { limit: "1", before: page1Body.nextCursor },
      token,
    );
    const page2Body = await page2.json();

    expect(page2Body.posts).toHaveLength(1);
    expect(page2Body.posts[0].id).toBe(first.id);
  });

  it("returns 400 invalid_cursor for a bookmark cursor that isn't the viewer's", async () => {
    const post = await makePost(strangerId, "Stranger post");
    const strangerBookmark = await prisma.bookmark.create({
      data: { userId: strangerId, postId: post.id },
    });

    const token = await signAccessToken(viewerId);
    const response = await getBookmarks({ before: strangerBookmark.id }, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");

    await prisma.bookmark.deleteMany({ where: { userId: strangerId } });
  });
});
