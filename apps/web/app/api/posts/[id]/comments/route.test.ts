import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { GET, POST } from "./route";

const PREFIX = "comment_create_";

function createCommentRequest(
  postId: string,
  body: unknown,
  accessToken?: string,
) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request(`http://localhost/api/posts/${postId}/comments`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: postId }) },
  );
}

function getComments(postId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(
    new Request(`http://localhost/api/posts/${postId}/comments`, { headers }),
    { params: Promise.resolve({ id: postId }) },
  );
}

let authorId: string;
let friendId: string;
let strangerId: string;
let profilePostId: string;
let createdCommentIds: string[] = [];

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [author, friend, stranger] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}author@example.com`,
        username: `${PREFIX}author`,
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
  ]);
  authorId = author.id;
  friendId = friend.id;
  strangerId = stranger.id;

  await prisma.friendship.create({
    data: { requesterId: authorId, addresseeId: friendId, status: "accepted" },
  });

  const post = await prisma.post.create({
    data: { authorId, content: "A post to comment on" },
  });
  profilePostId = post.id;
  createdCommentIds = [];
});

afterEach(async () => {
  await prisma.commentReaction.deleteMany({
    where: { comment: { postId: profilePostId } },
  });
  await prisma.comment.deleteMany({ where: { postId: profilePostId } });
  await prisma.post.deleteMany({ where: { id: profilePostId } });
  await prisma.friendship.deleteMany({
    where: { requesterId: authorId, addresseeId: friendId },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [authorId, friendId, strangerId] } },
  });
});

describe("POST /api/posts/:id/comments", () => {
  it("author comments on their own post", async () => {
    const token = await signAccessToken(authorId);
    const response = await createCommentRequest(
      profilePostId,
      { content: "Nice post" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    createdCommentIds.push(body.comment.id);

    const comment = await prisma.comment.findUnique({
      where: { id: body.comment.id },
    });
    expect(comment?.authorId).toBe(authorId);
    expect(comment?.parentCommentId).toBeNull();
  });

  it("an accepted friend can comment on the profile post", async () => {
    const token = await signAccessToken(friendId);
    const response = await createCommentRequest(
      profilePostId,
      { content: "Great!" },
      token,
    );

    expect(response.status).toBe(201);
  });

  it("returns 404 post_not_found for a stranger commenting on a profile post", async () => {
    const token = await signAccessToken(strangerId);
    const response = await createCommentRequest(
      profilePostId,
      { content: "Sneaky comment" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("post_not_found");
  });

  it("returns 404 post_not_found for a nonexistent post", async () => {
    const token = await signAccessToken(authorId);
    const response = await createCommentRequest(
      "00000000-0000-0000-0000-000000000000",
      { content: "Ghost post" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("post_not_found");
  });

  it("allows a reply to a top-level comment", async () => {
    const token = await signAccessToken(authorId);
    const topLevelRes = await createCommentRequest(
      profilePostId,
      { content: "Top level" },
      token,
    );
    const topLevel = (await topLevelRes.json()).comment;

    const replyRes = await createCommentRequest(
      profilePostId,
      { content: "A reply", parentCommentId: topLevel.id },
      token,
    );
    const replyBody = await replyRes.json();

    expect(replyRes.status).toBe(201);

    const reply = await prisma.comment.findUnique({
      where: { id: replyBody.comment.id },
    });
    expect(reply?.parentCommentId).toBe(topLevel.id);
  });

  it("returns 400 nested_reply_not_allowed for a reply to a reply", async () => {
    const token = await signAccessToken(authorId);
    const topLevelRes = await createCommentRequest(
      profilePostId,
      { content: "Top level" },
      token,
    );
    const topLevel = (await topLevelRes.json()).comment;
    const replyRes = await createCommentRequest(
      profilePostId,
      { content: "A reply", parentCommentId: topLevel.id },
      token,
    );
    const reply = (await replyRes.json()).comment;

    const nestedReplyRes = await createCommentRequest(
      profilePostId,
      { content: "Reply to a reply", parentCommentId: reply.id },
      token,
    );
    const nestedReplyBody = await nestedReplyRes.json();

    expect(nestedReplyRes.status).toBe(400);
    expect(nestedReplyBody.error.code).toBe("nested_reply_not_allowed");
  });

  it("returns 404 parent_not_found for a nonexistent parentCommentId", async () => {
    const token = await signAccessToken(authorId);
    const response = await createCommentRequest(
      profilePostId,
      {
        content: "Orphan reply",
        parentCommentId: "00000000-0000-0000-0000-000000000000",
      },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("parent_not_found");
  });

  it("returns 400 validation_error for empty content", async () => {
    const token = await signAccessToken(authorId);
    const response = await createCommentRequest(
      profilePostId,
      { content: "   " },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await createCommentRequest(profilePostId, {
      content: "No auth",
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("GET /api/posts/:id/comments", () => {
  it("lists top-level comments with nested replies, oldest first", async () => {
    const token = await signAccessToken(authorId);
    const firstRes = await createCommentRequest(
      profilePostId,
      { content: "First" },
      token,
    );
    const first = (await firstRes.json()).comment;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const secondRes = await createCommentRequest(
      profilePostId,
      { content: "Second" },
      token,
    );
    const second = (await secondRes.json()).comment;
    await createCommentRequest(
      profilePostId,
      { content: "A reply", parentCommentId: first.id },
      token,
    );

    const response = await getComments(profilePostId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.comments).toHaveLength(2);
    expect(body.comments[0].id).toBe(first.id);
    expect(body.comments[0].replies).toHaveLength(1);
    expect(body.comments[0].replies[0].content).toBe("A reply");
    expect(body.comments[1].id).toBe(second.id);
    expect(body.comments[1].replies).toHaveLength(0);
  });

  it("includes the viewer's own reactions on comments and replies, not counts", async () => {
    const token = await signAccessToken(authorId);
    const topRes = await createCommentRequest(
      profilePostId,
      { content: "Top" },
      token,
    );
    const top = (await topRes.json()).comment;
    const replyRes = await createCommentRequest(
      profilePostId,
      { content: "Reply", parentCommentId: top.id },
      token,
    );
    const reply = (await replyRes.json()).comment;
    await prisma.commentReaction.create({
      data: { commentId: top.id, userId: authorId, type: "clap" },
    });
    await prisma.commentReaction.create({
      data: { commentId: reply.id, userId: authorId, type: "fire" },
    });

    const response = await getComments(profilePostId, token);
    const body = await response.json();

    expect(body.comments[0].viewerReactions).toEqual(["clap"]);
    expect(body.comments[0].replies[0].viewerReactions).toEqual(["fire"]);
    expect(body.comments[0].reactionCount).toBeUndefined();
  });

  it("omits a deleted top-level comment along with its replies", async () => {
    const token = await signAccessToken(authorId);
    const topRes = await createCommentRequest(
      profilePostId,
      { content: "Will be deleted" },
      token,
    );
    const top = (await topRes.json()).comment;
    await createCommentRequest(
      profilePostId,
      { content: "Orphan reply", parentCommentId: top.id },
      token,
    );
    await prisma.comment.update({
      where: { id: top.id },
      data: { deletedAt: new Date() },
    });

    const response = await getComments(profilePostId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.comments).toHaveLength(0);
  });

  it("returns 404 post_not_found for a stranger", async () => {
    const token = await signAccessToken(strangerId);
    const response = await getComments(profilePostId, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("post_not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await getComments(profilePostId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
