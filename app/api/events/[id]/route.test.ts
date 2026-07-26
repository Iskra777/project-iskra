import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { DELETE, GET, PATCH } from "./route";

const PREFIX = "eventid_";

function getEvent(eventId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return GET(
    new Request(`http://localhost/api/events/${eventId}`, { headers }),
    {
      params: Promise.resolve({ id: eventId }),
    },
  );
}

function editEvent(eventId: string, body: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return PATCH(
    new Request(`http://localhost/api/events/${eventId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: eventId }) },
  );
}

function removeEvent(eventId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return DELETE(
    new Request(`http://localhost/api/events/${eventId}`, {
      method: "DELETE",
      headers,
    }),
    { params: Promise.resolve({ id: eventId }) },
  );
}

let organizerId: string;
let strangerId: string;
let eventId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [organizer, stranger] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}organizer@example.com`,
        username: `${PREFIX}organizer`,
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
  organizerId = organizer.id;
  strangerId = stranger.id;

  const event = await prisma.event.create({
    data: {
      organizerId,
      title: "Book club",
      format: "offline",
      locationOrLink: "Library",
      startsAt: new Date("2027-01-01T08:00:00.000Z"),
    },
  });
  eventId = event.id;
});

afterEach(async () => {
  await prisma.eventAttendee.deleteMany({
    where: { userId: { in: [organizerId, strangerId] } },
  });
  await prisma.event.deleteMany({
    where: { organizerId: { in: [organizerId, strangerId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [organizerId, strangerId] } },
  });
});

describe("GET /api/events/:id", () => {
  it("returns the event with organizer info to any authenticated viewer", async () => {
    const token = await signAccessToken(strangerId);
    const response = await getEvent(eventId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.event.id).toBe(eventId);
    expect(body.event.title).toBe("Book club");
    expect(body.event.organizer.id).toBe(organizerId);
    expect(body.event.organizer.username).toBe(`${PREFIX}organizer`);
    expect(body.event.viewerStatus).toBeNull();
  });

  it("returns the viewer's own attendance status", async () => {
    await prisma.eventAttendee.create({
      data: { eventId, userId: strangerId, status: "interested" },
    });

    const token = await signAccessToken(strangerId);
    const response = await getEvent(eventId, token);
    const body = await response.json();

    expect(body.event.viewerStatus).toBe("interested");
  });

  it("returns 404 not_found for a missing event", async () => {
    const token = await signAccessToken(strangerId);
    const response = await getEvent(crypto.randomUUID(), token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await getEvent(eventId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("PATCH /api/events/:id", () => {
  it("lets the organizer edit the event", async () => {
    const token = await signAccessToken(organizerId);
    const response = await editEvent(
      eventId,
      { title: "Book club, rescheduled" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.event.title).toBe("Book club, rescheduled");
  });

  it("returns 403 forbidden for a non-organizer", async () => {
    const token = await signAccessToken(strangerId);
    const response = await editEvent(eventId, { title: "Hijacked" }, token);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 404 not_found for a missing event", async () => {
    const token = await signAccessToken(organizerId);
    const response = await editEvent(
      crypto.randomUUID(),
      { title: "New title" },
      token,
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 400 validation_error when endsAt is before startsAt", async () => {
    const token = await signAccessToken(organizerId);
    const response = await editEvent(
      eventId,
      {
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
    const response = await editEvent(eventId, { title: "New title" });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});

describe("DELETE /api/events/:id", () => {
  it("lets the organizer delete the event", async () => {
    const token = await signAccessToken(organizerId);
    const response = await removeEvent(eventId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    expect(event).toBeNull();
  });

  it("returns 403 forbidden for a non-organizer", async () => {
    const token = await signAccessToken(strangerId);
    const response = await removeEvent(eventId, token);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    expect(event).not.toBeNull();
  });

  it("returns 401 without a token", async () => {
    const response = await removeEvent(eventId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
