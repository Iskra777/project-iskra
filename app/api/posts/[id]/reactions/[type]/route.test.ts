import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { DELETE, PUT } from "./route";

const PREFIX = "post_react_";

function putReaction(postId: string, type: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return PUT(
    new Request(`http://localhost/api/posts/${postId}/reactions/${type}`, {
      method: "PUT",
      headers,
    }),
    { params: Promise.resolve({ id: postId, type }) },
  );
}

function deleteReaction(postId: string, type: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return DELETE(
    new Request(`http://localhost/api/posts/${postId}/reactions/${type}`, {
      method: "DELETE",
      headers,
    }),
    { params: Promise.resolve({ id: postId, type }) },
  );
}

let authorId: string;
let strangerId: string;
let postId: string;

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
    data: { authorId, content: "React to me" },
  });
  postId = post.id;
});

afterEach(async () => {
  await prisma.postReaction.deleteMany({ where: { postId } });
  await prisma.post.deleteMany({ where: { id: postId } });
  await prisma.user.deleteMany({
    where: { id: { in: [authorId, strangerId] } },
  });
});

describe("PUT /api/posts/:id/reactions/:type", () => {
  it("sets a reaction", async () => {
    const token = await signAccessToken(authorId);
    const response = await putReaction(postId, "fire", token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const reaction = await prisma.postReaction.findUnique({
      where: { postId_userId_type: { postId, userId: authorId, type: "fire" } },
    });
    expect(reaction).not.toBeNull();
  });

  it("is idempotent when the same reaction is set twice", async () => {
    const token = await signAccessToken(authorId);
    await putReaction(postId, "fire", token);
    const response = await putReaction(postId, "fire", token);

    expect(response.status).toBe(200);

    const count = await prisma.postReaction.count({ where: { postId } });
    expect(count).toBe(1);
  });

  it("allows multiple different reaction types from the same user", async () => {
    const token = await signAccessToken(authorId);
    await putReaction(postId, "fire", token);
    await putReaction(postId, "bulb", token);

    const count = await prisma.postReaction.count({
      where: { postId, userId: authorId },
    });
    expect(count).toBe(2);
  });

  it("returns 400 validation_error for an invalid type", async () => {
    const token = await signAccessToken(authorId);
    const response = await putReaction(postId, "heart", token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 404 not_found for a stranger without visibility", async () => {
    const token = await signAccessToken(strangerId);
    const response = await putReaction(postId, "fire", token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await putReaction(postId, "fire");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("DELETE /api/posts/:id/reactions/:type", () => {
  it("removes an existing reaction", async () => {
    const token = await signAccessToken(authorId);
    await putReaction(postId, "fire", token);
    const response = await deleteReaction(postId, "fire", token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const reaction = await prisma.postReaction.findUnique({
      where: { postId_userId_type: { postId, userId: authorId, type: "fire" } },
    });
    expect(reaction).toBeNull();
  });

  it("is idempotent when there is nothing to remove", async () => {
    const token = await signAccessToken(authorId);
    const response = await deleteReaction(postId, "fire", token);

    expect(response.status).toBe(200);
  });

  it("returns 401 without a token", async () => {
    const response = await deleteReaction(postId, "fire");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
