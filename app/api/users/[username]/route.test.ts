import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { GET } from "./route";

const USERNAME = "profile_route_check";
const OTHER_USERNAME = "profile_route_other";

function getProfile(username: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(
    new Request(`http://localhost/api/users/${username}`, { headers }),
    { params: Promise.resolve({ username }) },
  );
}

let userId: string;
let otherUserId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

  const user = await prisma.user.create({
    data: {
      email: "profile-route-check@example.com",
      username: USERNAME,
      passwordHash: await hashPassword("correct horse battery staple"),
      bio: "Test bio",
      location: "Kyiv",
    },
  });
  userId = user.id;

  const other = await prisma.user.create({
    data: {
      email: "profile-route-other@example.com",
      username: OTHER_USERNAME,
      passwordHash: await hashPassword("correct horse battery staple"),
    },
  });
  otherUserId = other.id;
});

afterEach(async () => {
  await prisma.user.deleteMany({
    where: { id: { in: [userId, otherUserId] } },
  });
});

describe("GET /api/users/:username", () => {
  it("returns only public fields for an anonymous request", async () => {
    const response = await getProfile(USERNAME);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.username).toBe(USERNAME);
    expect(body.user.bio).toBe("Test bio");
    expect(body.user.email).toBeUndefined();
    expect(body.user.role).toBeUndefined();
    expect(body.user.isActive).toBeUndefined();
  });

  it("returns only public fields when viewed by a different user", async () => {
    const otherToken = await signAccessToken(otherUserId);
    const response = await getProfile(USERNAME, otherToken);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.email).toBeUndefined();
  });

  it("returns the full field set for the profile owner", async () => {
    const ownToken = await signAccessToken(userId);
    const response = await getProfile(USERNAME, ownToken);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.email).toBe("profile-route-check@example.com");
    expect(body.user.role).toBe("user");
    expect(body.user.isActive).toBe(true);
    expect(body.user.isEmailVerified).toBe(false);
  });

  it("returns 404 not_found for an unknown username", async () => {
    const response = await getProfile("no-such-username-at-all");
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 404 not_found for a deactivated account, even for the owner", async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });
    const ownToken = await signAccessToken(userId);

    const response = await getProfile(USERNAME, ownToken);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("ignores an invalid Authorization header and returns public fields", async () => {
    const response = await getProfile(USERNAME, "not-a-real-token");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.email).toBeUndefined();
  });
});
