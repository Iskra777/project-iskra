import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { DELETE, PUT } from "./route";

const PREFIX = "post_bookmark_";

function putBookmark(postId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return PUT(
    new Request(`http://localhost/api/posts/${postId}/bookmark`, {
      method: "PUT",
      headers,
    }),
    { params: Promise.resolve({ id: postId }) },
  );
}

function deleteBookmark(postId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return DELETE(
    new Request(`http://localhost/api/posts/${postId}/bookmark`, {
      method: "DELETE",
      headers,
    }),
    { params: Promise.resolve({ id: postId }) },
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
    data: { authorId, content: "Bookmark me" },
  });
  postId = post.id;
});

afterEach(async () => {
  await prisma.bookmark.deleteMany({ where: { postId } });
  await prisma.post.deleteMany({ where: { id: postId } });
  await prisma.user.deleteMany({
    where: { id: { in: [authorId, strangerId] } },
  });
});

describe("PUT /api/posts/:id/bookmark", () => {
  it("adds a bookmark", async () => {
    const token = await signAccessToken(authorId);
    const response = await putBookmark(postId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const bookmark = await prisma.bookmark.findUnique({
      where: { userId_postId: { userId: authorId, postId } },
    });
    expect(bookmark).not.toBeNull();
  });

  it("is idempotent when bookmarked twice", async () => {
    const token = await signAccessToken(authorId);
    await putBookmark(postId, token);
    const response = await putBookmark(postId, token);

    expect(response.status).toBe(200);

    const count = await prisma.bookmark.count({ where: { postId } });
    expect(count).toBe(1);
  });

  it("returns 404 not_found for a stranger without visibility", async () => {
    const token = await signAccessToken(strangerId);
    const response = await putBookmark(postId, token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await putBookmark(postId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("DELETE /api/posts/:id/bookmark", () => {
  it("removes an existing bookmark", async () => {
    const token = await signAccessToken(authorId);
    await putBookmark(postId, token);
    const response = await deleteBookmark(postId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const bookmark = await prisma.bookmark.findUnique({
      where: { userId_postId: { userId: authorId, postId } },
    });
    expect(bookmark).toBeNull();
  });

  it("is idempotent when there is nothing to remove", async () => {
    const token = await signAccessToken(authorId);
    const response = await deleteBookmark(postId, token);

    expect(response.status).toBe(200);
  });

  it("returns 401 without a token", async () => {
    const response = await deleteBookmark(postId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
