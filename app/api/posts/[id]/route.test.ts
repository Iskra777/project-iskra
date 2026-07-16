import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { DELETE, GET, PATCH } from "./route";

const PREFIX = "post_edit_";

function editPost(postId: string, body: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return PATCH(
    new Request(`http://localhost/api/posts/${postId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: postId }) },
  );
}

function getPost(postId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(new Request(`http://localhost/api/posts/${postId}`, { headers }), {
    params: Promise.resolve({ id: postId }),
  });
}

function removePost(postId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return DELETE(
    new Request(`http://localhost/api/posts/${postId}`, {
      method: "DELETE",
      headers,
    }),
    { params: Promise.resolve({ id: postId }) },
  );
}

let aliceId: string;
let bobId: string;
let postId: string;

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

  const post = await prisma.post.create({
    data: { authorId: aliceId, content: "Original content" },
  });
  postId = post.id;
});

afterEach(async () => {
  await prisma.post.deleteMany({
    where: { authorId: { in: [aliceId, bobId] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: [aliceId, bobId] } } });
});

describe("PATCH /api/posts/:id", () => {
  it("author edits their own post", async () => {
    const token = await signAccessToken(aliceId);
    const response = await editPost(
      postId,
      { content: "Updated content" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.post.content).toBe("Updated content");

    const post = await prisma.post.findUnique({ where: { id: postId } });
    expect(post?.content).toBe("Updated content");
  });

  it("sets mediaUrl when provided", async () => {
    const token = await signAccessToken(aliceId);
    const response = await editPost(
      postId,
      { content: "With a picture", mediaUrl: "https://example.com/photo.webp" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.post.mediaUrl).toBe("https://example.com/photo.webp");

    const post = await prisma.post.findUnique({ where: { id: postId } });
    expect(post?.mediaUrl).toBe("https://example.com/photo.webp");
  });

  it("clears mediaUrl when explicitly set to null", async () => {
    await prisma.post.update({
      where: { id: postId },
      data: { mediaUrl: "https://example.com/photo.webp" },
    });
    const token = await signAccessToken(aliceId);
    const response = await editPost(
      postId,
      { content: "No picture anymore", mediaUrl: null },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.post.mediaUrl).toBeNull();
  });

  it("leaves mediaUrl untouched when omitted", async () => {
    await prisma.post.update({
      where: { id: postId },
      data: { mediaUrl: "https://example.com/photo.webp" },
    });
    const token = await signAccessToken(aliceId);
    const response = await editPost(
      postId,
      { content: "Just text edit" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.post.mediaUrl).toBe("https://example.com/photo.webp");
  });

  it("returns 403 forbidden for a non-author", async () => {
    const token = await signAccessToken(bobId);
    const response = await editPost(postId, { content: "Hijacked" }, token);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 404 not_found for a nonexistent post", async () => {
    const token = await signAccessToken(aliceId);
    const response = await editPost(
      "00000000-0000-0000-0000-000000000000",
      { content: "Ghost" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 404 not_found for an already-deleted post", async () => {
    await prisma.post.update({
      where: { id: postId },
      data: { deletedAt: new Date() },
    });
    const token = await signAccessToken(aliceId);
    const response = await editPost(postId, { content: "Resurrect" }, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 400 validation_error for empty content", async () => {
    const token = await signAccessToken(aliceId);
    const response = await editPost(postId, { content: "   " }, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await editPost(postId, { content: "No auth" });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("DELETE /api/posts/:id", () => {
  it("author deletes their own post (soft delete)", async () => {
    const token = await signAccessToken(aliceId);
    const response = await removePost(postId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const post = await prisma.post.findUnique({ where: { id: postId } });
    expect(post?.deletedAt).not.toBeNull();
  });

  it("returns 403 forbidden for a non-author", async () => {
    const token = await signAccessToken(bobId);
    const response = await removePost(postId, token);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 404 not_found for a nonexistent post", async () => {
    const token = await signAccessToken(aliceId);
    const response = await removePost(
      "00000000-0000-0000-0000-000000000000",
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 404 not_found for an already-deleted post", async () => {
    await prisma.post.update({
      where: { id: postId },
      data: { deletedAt: new Date() },
    });
    const token = await signAccessToken(aliceId);
    const response = await removePost(postId, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await removePost(postId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("GET /api/posts/:id", () => {
  const GET_PREFIX = "post_get_";
  let authorId: string;
  let friendId: string;
  let strangerId: string;
  let communityMemberId: string;
  let profilePostId: string;
  let communityId: string;
  let communityPostId: string;
  let privateCommunityId: string;

  beforeEach(async () => {
    process.env.JWT_SECRET = "test-access-secret";
    const passwordHash = await hashPassword("correct horse battery staple");

    const [author, friend, stranger, communityMember] = await Promise.all([
      prisma.user.create({
        data: {
          email: `${GET_PREFIX}author@example.com`,
          username: `${GET_PREFIX}author`,
          passwordHash,
        },
      }),
      prisma.user.create({
        data: {
          email: `${GET_PREFIX}friend@example.com`,
          username: `${GET_PREFIX}friend`,
          passwordHash,
        },
      }),
      prisma.user.create({
        data: {
          email: `${GET_PREFIX}stranger@example.com`,
          username: `${GET_PREFIX}stranger`,
          passwordHash,
        },
      }),
      prisma.user.create({
        data: {
          email: `${GET_PREFIX}commember@example.com`,
          username: `${GET_PREFIX}commember`,
          passwordHash,
        },
      }),
    ]);
    authorId = author.id;
    friendId = friend.id;
    strangerId = stranger.id;
    communityMemberId = communityMember.id;

    await prisma.friendship.create({
      data: {
        requesterId: authorId,
        addresseeId: friendId,
        status: "accepted",
      },
    });

    const profilePost = await prisma.post.create({
      data: { authorId, content: "Profile post" },
    });
    profilePostId = profilePost.id;

    const community = await prisma.community.create({
      data: {
        ownerId: authorId,
        name: `${GET_PREFIX}club`,
        visibility: "public",
        members: {
          create: [
            { userId: authorId, role: "admin", status: "approved" },
            { userId: communityMemberId, role: "member", status: "approved" },
          ],
        },
      },
    });
    communityId = community.id;
    const communityPost = await prisma.post.create({
      data: { authorId, communityId, content: "Community post" },
    });
    communityPostId = communityPost.id;

    const privateCommunity = await prisma.community.create({
      data: {
        ownerId: strangerId,
        name: `${GET_PREFIX}private_club`,
        visibility: "private",
        members: {
          create: [{ userId: strangerId, role: "admin", status: "approved" }],
        },
      },
    });
    privateCommunityId = privateCommunity.id;
  });

  afterEach(async () => {
    await prisma.postReaction.deleteMany({ where: { postId: profilePostId } });
    await prisma.post.deleteMany({ where: { authorId } });
    const communityIds = [communityId, privateCommunityId];
    await prisma.communityMember.deleteMany({
      where: { communityId: { in: communityIds } },
    });
    await prisma.community.deleteMany({ where: { id: { in: communityIds } } });
    await prisma.friendship.deleteMany({
      where: { requesterId: authorId, addresseeId: friendId },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [authorId, friendId, strangerId, communityMemberId] },
      },
    });
  });

  it("author views their own profile post", async () => {
    const token = await signAccessToken(authorId);
    const response = await getPost(profilePostId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.post.content).toBe("Profile post");
  });

  it("includes the viewer's own reactions, not counts", async () => {
    await prisma.postReaction.create({
      data: { postId: profilePostId, userId: authorId, type: "bulb" },
    });
    const token = await signAccessToken(authorId);
    const response = await getPost(profilePostId, token);
    const body = await response.json();

    expect(body.post.viewerReactions).toEqual(["bulb"]);
    expect(body.post.reactionCount).toBeUndefined();
  });

  it("an accepted friend can view the profile post", async () => {
    const token = await signAccessToken(friendId);
    const response = await getPost(profilePostId, token);

    expect(response.status).toBe(200);
  });

  it("returns 404 not_found for a stranger viewing a profile post", async () => {
    const token = await signAccessToken(strangerId);
    const response = await getPost(profilePostId, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("a community member can view a community post regardless of friendship", async () => {
    const token = await signAccessToken(communityMemberId);
    const response = await getPost(communityPostId, token);

    expect(response.status).toBe(200);
  });

  it("returns 404 not_found for a non-member viewing a community post", async () => {
    const token = await signAccessToken(strangerId);
    const response = await getPost(communityPostId, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 404 not_found for a nonexistent post", async () => {
    const token = await signAccessToken(authorId);
    const response = await getPost(
      "00000000-0000-0000-0000-000000000000",
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await getPost(profilePostId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
