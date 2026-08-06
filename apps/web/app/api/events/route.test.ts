import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { GET, POST } from "./route";

const PREFIX = "event_";

function createEvent(body: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return POST(
    new Request("http://localhost/api/events", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

function listEvents(query: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(new Request(`http://localhost/api/events${query}`, { headers }));
}

let userId: string;
let otherUserId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [user, otherUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}user@example.com`,
        username: `${PREFIX}user`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}other@example.com`,
        username: `${PREFIX}other`,
        passwordHash,
      },
    }),
  ]);
  userId = user.id;
  otherUserId = otherUser.id;
});

afterEach(async () => {
  await prisma.eventAttendee.deleteMany({
    where: { userId: { in: [userId, otherUserId] } },
  });
  await prisma.event.deleteMany({
    where: { organizerId: { in: [userId, otherUserId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [userId, otherUserId] } },
  });
});

describe("POST /api/events", () => {
  it("creates an event", async () => {
    const token = await signAccessToken(userId);
    const response = await createEvent(
      {
        title: "Ranok yoga",
        format: "offline",
        locationOrLink: "Park entrance",
        startsAt: "2027-01-01T08:00:00.000Z",
      },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.event.title).toBe("Ranok yoga");
    expect(body.event.format).toBe("offline");
    expect(body.event.locationOrLink).toBe("Park entrance");
    expect(body.event.description).toBeNull();
    expect(body.event.endsAt).toBeNull();
    expect(body.event.organizerId).toBe(userId);
  });

  it("accepts description and endsAt", async () => {
    const token = await signAccessToken(userId);
    const response = await createEvent(
      {
        title: "Webinar",
        description: "Intro session",
        format: "online",
        locationOrLink: "https://example.com/room",
        startsAt: "2027-01-01T08:00:00.000Z",
        endsAt: "2027-01-01T09:00:00.000Z",
      },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.event.description).toBe("Intro session");
    expect(body.event.endsAt).toBe("2027-01-01T09:00:00.000Z");
  });

  it("returns 400 validation_error for an empty title", async () => {
    const token = await signAccessToken(userId);
    const response = await createEvent(
      { title: "  ", format: "online", startsAt: "2027-01-01T08:00:00.000Z" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 400 validation_error when endsAt is before startsAt", async () => {
    const token = await signAccessToken(userId);
    const response = await createEvent(
      {
        title: "Webinar",
        format: "online",
        startsAt: "2027-01-01T09:00:00.000Z",
        endsAt: "2027-01-01T08:00:00.000Z",
      },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await createEvent({
      title: "Webinar",
      format: "online",
      startsAt: "2027-01-01T08:00:00.000Z",
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("GET /api/events", () => {
  it("lists events soonest first, across organizers", async () => {
    const later = await prisma.event.create({
      data: {
        organizerId: userId,
        title: "Later event",
        format: "online",
        startsAt: new Date("2027-02-01T00:00:00.000Z"),
      },
    });
    const sooner = await prisma.event.create({
      data: {
        organizerId: otherUserId,
        title: "Sooner event",
        format: "online",
        startsAt: new Date("2027-01-01T00:00:00.000Z"),
      },
    });

    const token = await signAccessToken(userId);
    // Event is a global public list (unlike Goal), so a concurrently
    // running test file may create unrelated events in the same window —
    // filter to just the two this test created before checking order.
    const response = await listEvents("?limit=100", token);
    const body = await response.json();
    const ourIds = body.events
      .map((e: { id: string }) => e.id)
      .filter((id: string) => id === sooner.id || id === later.id);

    expect(response.status).toBe(200);
    expect(ourIds).toEqual([sooner.id, later.id]);
  });

  it("paginates with nextCursor", async () => {
    // Event is a global public list; startsAt is pushed to a year no other
    // fixture in the suite uses (they cluster around 2027) so concurrently
    // running test files can't interleave rows into this exact-count check.
    for (let i = 0; i < 3; i++) {
      await prisma.event.create({
        data: {
          organizerId: userId,
          title: `Event ${i}`,
          format: "online",
          startsAt: new Date(2094, 0, i + 1),
        },
      });
    }

    const token = await signAccessToken(userId);
    const first = await listEvents("?limit=2", token);
    const firstBody = await first.json();

    expect(firstBody.events).toHaveLength(2);
    expect(firstBody.nextCursor).not.toBeNull();

    const second = await listEvents(
      `?limit=2&after=${firstBody.nextCursor}`,
      token,
    );
    const secondBody = await second.json();

    expect(secondBody.events).toHaveLength(1);
    expect(secondBody.nextCursor).toBeNull();
  });

  it("returns 400 validation_error for an invalid cursor", async () => {
    const token = await signAccessToken(userId);
    const response = await listEvents(`?after=${crypto.randomUUID()}`, token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 401 without a token", async () => {
    const response = await listEvents("");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
