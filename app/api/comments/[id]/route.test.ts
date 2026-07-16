import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { DELETE, PATCH } from "./route";

const PREFIX = "comment_edit_";

function editComment(commentId: string, body: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return PATCH(
    new Request(`http://localhost/api/comments/${commentId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: commentId }) },
  );
}

function removeComment(commentId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return DELETE(
    new Request(`http://localhost/api/comments/${commentId}`, {
      method: "DELETE",
      headers,
    }),
    { params: Promise.resolve({ id: commentId }) },
  );
}

let aliceId: string;
let bobId: string;
let postId: string;
let commentId: string;

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
    data: { authorId: aliceId, content: "A post" },
  });
  postId = post.id;

  const comment = await prisma.comment.create({
    data: { postId, authorId: aliceId, content: "Original comment" },
  });
  commentId = comment.id;
});

afterEach(async () => {
  await prisma.comment.deleteMany({ where: { postId } });
  await prisma.post.deleteMany({ where: { id: postId } });
  await prisma.user.deleteMany({ where: { id: { in: [aliceId, bobId] } } });
});

describe("PATCH /api/comments/:id", () => {
  it("author edits their own comment", async () => {
    const token = await signAccessToken(aliceId);
    const response = await editComment(
      commentId,
      { content: "Updated comment" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.comment.content).toBe("Updated comment");

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });
    expect(comment?.content).toBe("Updated comment");
  });

  it("returns 403 forbidden for a non-author", async () => {
    const token = await signAccessToken(bobId);
    const response = await editComment(
      commentId,
      { content: "Hijacked" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 404 not_found for a nonexistent comment", async () => {
    const token = await signAccessToken(aliceId);
    const response = await editComment(
      "00000000-0000-0000-0000-000000000000",
      { content: "Ghost" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 404 not_found for an already-deleted comment", async () => {
    await prisma.comment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });
    const token = await signAccessToken(aliceId);
    const response = await editComment(
      commentId,
      { content: "Resurrect" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 400 validation_error for empty content", async () => {
    const token = await signAccessToken(aliceId);
    const response = await editComment(commentId, { content: "   " }, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await editComment(commentId, { content: "No auth" });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("DELETE /api/comments/:id", () => {
  it("author deletes their own comment (soft delete)", async () => {
    const token = await signAccessToken(aliceId);
    const response = await removeComment(commentId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });
    expect(comment?.deletedAt).not.toBeNull();
  });

  it("does not delete or block replies to the deleted comment", async () => {
    const reply = await prisma.comment.create({
      data: {
        postId,
        authorId: bobId,
        parentCommentId: commentId,
        content: "A reply",
      },
    });

    const token = await signAccessToken(aliceId);
    await removeComment(commentId, token);

    const replyAfter = await prisma.comment.findUnique({
      where: { id: reply.id },
    });
    expect(replyAfter?.deletedAt).toBeNull();
    expect(replyAfter?.parentCommentId).toBe(commentId);
  });

  it("returns 403 forbidden for a non-author", async () => {
    const token = await signAccessToken(bobId);
    const response = await removeComment(commentId, token);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 404 not_found for a nonexistent comment", async () => {
    const token = await signAccessToken(aliceId);
    const response = await removeComment(
      "00000000-0000-0000-0000-000000000000",
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 404 not_found for an already-deleted comment", async () => {
    await prisma.comment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });
    const token = await signAccessToken(aliceId);
    const response = await removeComment(commentId, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await removeComment(commentId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
