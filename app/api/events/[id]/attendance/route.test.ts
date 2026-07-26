import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { signAccessToken } from "@/lib/auth/tokens";
import { DELETE, PUT } from "./route";

const PREFIX = "event_attendance_";

function putAttendance(eventId: string, status: unknown, accessToken?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return PUT(
    new Request(`http://localhost/api/events/${eventId}/attendance`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ status }),
    }),
    { params: Promise.resolve({ id: eventId }) },
  );
}

function deleteAttendance(eventId: string, accessToken?: string) {
  const headers: HeadersInit = {};
  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }
  return DELETE(
    new Request(`http://localhost/api/events/${eventId}/attendance`, {
      method: "DELETE",
      headers,
    }),
    { params: Promise.resolve({ id: eventId }) },
  );
}

let organizerId: string;
let attendeeId: string;
let eventId: string;

beforeEach(async () => {
  process.env.JWT_SECRET = "test-access-secret";
  const passwordHash = await hashPassword("correct horse battery staple");

  const [organizer, attendee] = await Promise.all([
    prisma.user.create({
      data: {
        email: `${PREFIX}organizer@example.com`,
        username: `${PREFIX}organizer`,
        passwordHash,
      },
    }),
    prisma.user.create({
      data: {
        email: `${PREFIX}attendee@example.com`,
        username: `${PREFIX}attendee`,
        passwordHash,
      },
    }),
  ]);
  organizerId = organizer.id;
  attendeeId = attendee.id;

  const event = await prisma.event.create({
    data: {
      organizerId,
      title: "Attend me",
      format: "online",
      startsAt: new Date("2027-01-01T08:00:00.000Z"),
    },
  });
  eventId = event.id;
});

afterEach(async () => {
  await prisma.eventAttendee.deleteMany({ where: { eventId } });
  await prisma.event.deleteMany({ where: { id: eventId } });
  await prisma.user.deleteMany({
    where: { id: { in: [organizerId, attendeeId] } },
  });
});

describe("PUT /api/events/:id/attendance", () => {
  it("registers with the given status", async () => {
    const token = await signAccessToken(attendeeId);
    const response = await putAttendance(eventId, "going", token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const attendance = await prisma.eventAttendee.findUnique({
      where: { eventId_userId: { eventId, userId: attendeeId } },
    });
    expect(attendance?.status).toBe("going");
  });

  it("is idempotent and updates the status on a second call", async () => {
    const token = await signAccessToken(attendeeId);
    await putAttendance(eventId, "interested", token);
    const response = await putAttendance(eventId, "going", token);

    expect(response.status).toBe(200);

    const count = await prisma.eventAttendee.count({ where: { eventId } });
    expect(count).toBe(1);

    const attendance = await prisma.eventAttendee.findUnique({
      where: { eventId_userId: { eventId, userId: attendeeId } },
    });
    expect(attendance?.status).toBe("going");
  });

  it("returns 400 validation_error for status 'declined'", async () => {
    const token = await signAccessToken(attendeeId);
    const response = await putAttendance(eventId, "declined", token);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 404 not_found for a missing event", async () => {
    const token = await signAccessToken(attendeeId);
    const response = await putAttendance(crypto.randomUUID(), "going", token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await putAttendance(eventId, "going");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });

  it("lets the organizer register for their own event", async () => {
    const token = await signAccessToken(organizerId);
    const response = await putAttendance(eventId, "going", token);

    expect(response.status).toBe(200);
  });
});

describe("DELETE /api/events/:id/attendance", () => {
  it("removes an existing registration", async () => {
    const token = await signAccessToken(attendeeId);
    await putAttendance(eventId, "going", token);
    const response = await deleteAttendance(eventId, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const attendance = await prisma.eventAttendee.findUnique({
      where: { eventId_userId: { eventId, userId: attendeeId } },
    });
    expect(attendance).toBeNull();
  });

  it("is idempotent when there is nothing to remove", async () => {
    const token = await signAccessToken(attendeeId);
    const response = await deleteAttendance(eventId, token);

    expect(response.status).toBe(200);
  });

  it("returns 404 not_found for a missing event", async () => {
    const token = await signAccessToken(attendeeId);
    const response = await deleteAttendance(crypto.randomUUID(), token);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("returns 401 without a token", async () => {
    const response = await deleteAttendance(eventId);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("invalid_token");
  });
});
