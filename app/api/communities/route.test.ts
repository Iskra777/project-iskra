import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { POST } from "./route";

const PREFIX = "comm_create_";

function createCommunity(body: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request("http://localhost/api/communities", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

let aliceId: string;
let createdCommunityIds: string[] = [];

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const alice = await prisma.user.create({
    data: {
      email: `${PREFIX}alice@example.com`,
      username: `${PREFIX}alice`,
      passwordHash,
    },
  });
  aliceId = alice.id;
  createdCommunityIds = [];
});

afterEach(async () => {
  await prisma.communityMember.deleteMany({
    where: { communityId: { in: createdCommunityIds } },
  });
  await prisma.community.deleteMany({
    where: { id: { in: createdCommunityIds } },
  });
  await prisma.user.deleteMany({ where: { id: aliceId } });
});

describe("POST /api/communities", () => {
  it("creates a public community with the creator as approved admin", async () => {
    const token = await signAccessToken(aliceId);
    const response = await createCommunity(
      {
        name: `${PREFIX}mountains`,
        description: "Люди, що люблять гори",
        visibility: "public",
      },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    createdCommunityIds.push(body.community.id);

    const community = await prisma.community.findUnique({
      where: { id: body.community.id },
    });
    expect(community?.name).toBe(`${PREFIX}mountains`);
    expect(community?.visibility).toBe("public");
    expect(community?.ownerId).toBe(aliceId);

    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: { communityId: body.community.id, userId: aliceId },
      },
    });
    expect(membership?.role).toBe("admin");
    expect(membership?.status).toBe("approved");
  });

  it("creates a private community without a description", async () => {
    const token = await signAccessToken(aliceId);
    const response = await createCommunity(
      { name: `${PREFIX}private_club`, visibility: "private" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    createdCommunityIds.push(body.community.id);

    const community = await prisma.community.findUnique({
      where: { id: body.community.id },
    });
    expect(community?.visibility).toBe("private");
    expect(community?.description).toBeNull();
  });

  it("returns 409 name_taken for a duplicate name", async () => {
    const token = await signAccessToken(aliceId);
    const first = await createCommunity(
      { name: `${PREFIX}dup`, visibility: "public" },
      token,
    );
    const firstBody = await first.json();
    createdCommunityIds.push(firstBody.community.id);

    const second = await createCommunity(
      { name: `${PREFIX}dup`, visibility: "private" },
      token,
    );
    const secondBody = await second.json();

    expect(second.status).toBe(409);
    expect(secondBody.error.code).toBe("name_taken");
  });

  it("returns 400 validation_error for a name that's too short", async () => {
    const token = await signAccessToken(aliceId);
    const response = await createCommunity(
      { name: "ab", visibility: "public" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 400 validation_error for an invalid visibility", async () => {
    const token = await signAccessToken(aliceId);
    const response = await createCommunity(
      { name: `${PREFIX}badvis`, visibility: "everyone" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await createCommunity({
      name: `${PREFIX}noauth`,
      visibility: "public",
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
