import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { DELETE, PUT } from "./route";

const PREFIX = "comment_react_";

function putReaction(commentId: string, type: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return PUT(
    new Request(
      `http://localhost/api/comments/${commentId}/reactions/${type}`,
      { method: "PUT", headers },
    ),
    { params: Promise.resolve({ id: commentId, type }) },
  );
}

function deleteReaction(commentId: string, type: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return DELETE(
    new Request(
      `http://localhost/api/comments/${commentId}/reactions/${type}`,
      { method: "DELETE", headers },
    ),
    { params: Promise.resolve({ id: commentId, type }) },
  );
}

let authorId: string;
let strangerId: string;
let postId: string;
let commentId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [author, stranger] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}author@example.com`,
        username: `${PREFIX}author`,
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
  strangerId = stranger.id;

  const post = await prisma.post.create({
    data: { authorId, content: "A post" },
  });
  postId = post.id;

  const comment = await prisma.comment.create({
    data: { postId, authorId, content: "React to me" },
  });
  commentId = comment.id;
});

afterEach(async () => {
  await prisma.commentReaction.deleteMany({ where: { commentId } });
  await prisma.comment.deleteMany({ where: { postId } });
  await prisma.post.deleteMany({ where: { id: postId } });
  await prisma.user.deleteMany({
    where: { id: { in: [authorId, strangerId] } },
  });
});

describe("PUT /api/comments/:id/reactions/:type", () => {
  it("sets a reaction", async () => {
    const token = await signAccessToken(authorId);
    const response = await putReaction(commentId, "clap", token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const reaction = await prisma.commentReaction.findUnique({
      where: {
        commentId_userId_type: { commentId, userId: authorId, type: "clap" },
      },
    });
    expect(reaction).not.toBeNull();
  });

  it("is idempotent when the same reaction is set twice", async () => {
    const token = await signAccessToken(authorId);
    await putReaction(commentId, "clap", token);
    const response = await putReaction(commentId, "clap", token);

    expect(response.status).toBe(200);

    const count = await prisma.commentReaction.count({
      where: { commentId },
    });
    expect(count).toBe(1);
  });

  it("returns 400 validation_error for an invalid type", async () => {
    const token = await signAccessToken(authorId);
    const response = await putReaction(commentId, "heart", token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 404 not_found for a stranger without visibility", async () => {
    const token = await signAccessToken(strangerId);
    const response = await putReaction(commentId, "clap", token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await putReaction(commentId, "clap");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("DELETE /api/comments/:id/reactions/:type", () => {
  it("removes an existing reaction", async () => {
    const token = await signAccessToken(authorId);
    await putReaction(commentId, "clap", token);
    const response = await deleteReaction(commentId, "clap", token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const reaction = await prisma.commentReaction.findUnique({
      where: {
        commentId_userId_type: { commentId, userId: authorId, type: "clap" },
      },
    });
    expect(reaction).toBeNull();
  });

  it("is idempotent when there is nothing to remove", async () => {
    const token = await signAccessToken(authorId);
    const response = await deleteReaction(commentId, "clap", token);

    expect(response.status).toBe(200);
  });

  it("returns 401 without a token", async () => {
    const response = await deleteReaction(commentId, "clap");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
