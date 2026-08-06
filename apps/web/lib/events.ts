import { prisma } from "@/lib/prisma";
import { authorSelect } from "@/lib/feed";

export type EventFormat = "online" | "offline";

export interface EventOrganizer {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface Event {
  id: string;
  organizerId: string;
  title: string;
  description: string | null;
  format: EventFormat;
  locationOrLink: string | null;
  startsAt: Date;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toEvent(event: {
  id: string;
  organizerId: string;
  title: string;
  description: string | null;
  format: EventFormat;
  locationOrLink: string | null;
  startsAt: Date;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Event {
  return {
    id: event.id,
    organizerId: event.organizerId,
    title: event.title,
    description: event.description,
    format: event.format,
    locationOrLink: event.locationOrLink,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

export interface CreateEventInput {
  title: string;
  description: string | null;
  format: EventFormat;
  locationOrLink: string | null;
  startsAt: Date;
  endsAt: Date | null;
}

export async function createEvent(
  organizerId: string,
  input: CreateEventInput,
): Promise<Event> {
  const event = await prisma.event.create({
    data: {
      organizerId,
      title: input.title,
      description: input.description,
      format: input.format,
      locationOrLink: input.locationOrLink,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    },
  });
  return toEvent(event);
}

export type ListEventsErrorCode = "invalid_cursor";

export type ListEventsResult =
  | { ok: true; events: Event[]; nextCursor: string | null }
  | { ok: false; code: ListEventsErrorCode };

/**
 * Публічний календар — усі події видимі всім авторизованим користувачам
 * (немає поля приватності, DATABASE.md → Event). Сортування за `startsAt`
 * зростаюче (найближчі спочатку), а не `createdAt` спадаюче, як у
 * Goal/Post — це календар, не стрічка.
 */
export async function listEvents(
  after: string | null,
  limit: number,
): Promise<ListEventsResult> {
  if (after) {
    const cursorEvent = await prisma.event.findUnique({
      where: { id: after },
    });
    if (!cursorEvent) return { ok: false, code: "invalid_cursor" };
  }

  const events = await prisma.event.findMany({
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: limit,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
  });

  const nextCursor =
    events.length === limit ? events[events.length - 1].id : null;

  return { ok: true, events: events.map(toEvent), nextCursor };
}

export type EventErrorCode = "not_found";

export interface EventDetail extends Event {
  organizer: EventOrganizer;
  viewerStatus: "going" | "interested" | "declined" | null;
}

export type GetEventResult =
  { ok: true; event: EventDetail } | { ok: false; code: EventErrorCode };

/**
 * Одиночний перегляд включає організатора (публічні поля, той самий
 * `authorSelect`, що й у постах) і `viewerStatus` — власну реєстрацію
 * глядача. Без лічильника учасників — Principle 7 (немає публічних
 * лічильників взаємодії ніде в проєкті).
 */
export async function getEvent(
  eventId: string,
  viewerId: string,
): Promise<GetEventResult> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { organizer: { select: authorSelect } },
  });
  if (!event) return { ok: false, code: "not_found" };

  const attendance = await prisma.eventAttendee.findUnique({
    where: { eventId_userId: { eventId, userId: viewerId } },
  });

  return {
    ok: true,
    event: {
      ...toEvent(event),
      organizer: event.organizer,
      viewerStatus: attendance?.status ?? null,
    },
  };
}

export type EventMutationErrorCode = "not_found" | "forbidden";

export interface EditEventInput {
  title?: string;
  description?: string | null;
  format?: EventFormat;
  locationOrLink?: string | null;
  startsAt?: Date;
  endsAt?: Date | null;
}

export type EditEventResult =
  { ok: true; event: Event } | { ok: false; code: EventMutationErrorCode };

/** Лише організатор — публічно видима подія, тож чужа/чужого редагування
 * дає `forbidden`, не `not_found` (той самий підхід, що й lib/posts.ts). */
export async function editEvent(
  eventId: string,
  actorId: string,
  input: EditEventInput,
): Promise<EditEventResult> {
  const existing = await prisma.event.findUnique({ where: { id: eventId } });
  if (!existing) return { ok: false, code: "not_found" };
  if (existing.organizerId !== actorId) return { ok: false, code: "forbidden" };

  const event = await prisma.event.update({
    where: { id: eventId },
    data: input,
  });
  return { ok: true, event: toEvent(event) };
}

export type DeleteEventResult =
  { ok: true } | { ok: false; code: EventMutationErrorCode };

/** Жорстке видалення — Event, як Goal, не має `deletedAt` у схемі. */
export async function deleteEvent(
  eventId: string,
  actorId: string,
): Promise<DeleteEventResult> {
  const existing = await prisma.event.findUnique({ where: { id: eventId } });
  if (!existing) return { ok: false, code: "not_found" };
  if (existing.organizerId !== actorId) return { ok: false, code: "forbidden" };

  await prisma.event.delete({ where: { id: eventId } });
  return { ok: true };
}

/** `declined` навмисно не приймається тут — значення в EventAttendee.status
 * зарезервоване для майбутнього флоу запрошень (DATABASE.md → Event), якого
 * зараз немає; є лише самостійна реєстрація. */
export type AttendanceStatus = "going" | "interested";

export type AttendanceResult =
  { ok: true } | { ok: false; code: EventErrorCode };

/** Ідемпотентна реєстрація/зміна статусу — `upsert`, той самий підхід,
 * що й lib/bookmarks.ts. */
export async function setAttendance(
  eventId: string,
  userId: string,
  status: AttendanceStatus,
): Promise<AttendanceResult> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return { ok: false, code: "not_found" };

  await prisma.eventAttendee.upsert({
    where: { eventId_userId: { eventId, userId } },
    create: { eventId, userId, status },
    update: { status },
  });

  return { ok: true };
}

/** Ідемпотентна відміна — `deleteMany` не кидає помилку, якщо реєстрації
 * й не було (той самий підхід, що й lib/bookmarks.ts). */
export async function removeAttendance(
  eventId: string,
  userId: string,
): Promise<AttendanceResult> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return { ok: false, code: "not_found" };

  await prisma.eventAttendee.deleteMany({ where: { eventId, userId } });

  return { ok: true };
}
