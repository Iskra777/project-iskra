import { prisma } from "@/lib/prisma";

export interface DiaryEntry {
  id: string;
  title: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDiaryEntry(entry: {
  id: string;
  title: string | null;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}): DiaryEntry {
  return {
    id: entry.id,
    title: entry.title,
    content: entry.content,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

export interface CreateDiaryEntryInput {
  title: string | null;
  content: string;
}

export async function createDiaryEntry(
  userId: string,
  input: CreateDiaryEntryInput,
): Promise<DiaryEntry> {
  const entry = await prisma.diaryEntry.create({
    data: { userId, title: input.title, content: input.content },
  });
  return toDiaryEntry(entry);
}

export type GetDiaryEntriesErrorCode = "invalid_cursor";

export type GetDiaryEntriesResult =
  | { ok: true; entries: DiaryEntry[]; nextCursor: string | null }
  | { ok: false; code: GetDiaryEntriesErrorCode };

/**
 * Курсорна пагінація, той самий підхід, що й getFeed/getBookmarks
 * (lib/feed.ts, lib/bookmarks.ts) — на відміну від Goal (малий, скінченний
 * список), щоденник необмежений у часі журнал.
 */
export async function getDiaryEntries(
  userId: string,
  before: string | null,
  limit: number,
): Promise<GetDiaryEntriesResult> {
  if (before) {
    const cursorEntry = await prisma.diaryEntry.findFirst({
      where: { id: before, userId },
    });
    if (!cursorEntry) return { ok: false, code: "invalid_cursor" };
  }

  const entries = await prisma.diaryEntry.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
  });

  const nextCursor =
    entries.length === limit ? entries[entries.length - 1].id : null;

  return { ok: true, entries: entries.map(toDiaryEntry), nextCursor };
}

export type DiaryEntryErrorCode = "not_found";

export type GetDiaryEntryResult =
  { ok: true; entry: DiaryEntry } | { ok: false; code: DiaryEntryErrorCode };

/** Завжди приватний — єдина перевірка видимості: userId === viewer
 * (DATABASE.md → DiaryEntry). Чужий/неіснуючий запис → однаково
 * `not_found`, той самий anti-enumeration підхід, що й Goal. */
export async function getDiaryEntry(
  entryId: string,
  userId: string,
): Promise<GetDiaryEntryResult> {
  const entry = await prisma.diaryEntry.findFirst({
    where: { id: entryId, userId },
  });
  if (!entry) return { ok: false, code: "not_found" };
  return { ok: true, entry: toDiaryEntry(entry) };
}

export interface EditDiaryEntryInput {
  title?: string | null;
  content?: string;
}

export type EditDiaryEntryResult =
  { ok: true; entry: DiaryEntry } | { ok: false; code: DiaryEntryErrorCode };

export async function editDiaryEntry(
  entryId: string,
  userId: string,
  input: EditDiaryEntryInput,
): Promise<EditDiaryEntryResult> {
  const existing = await prisma.diaryEntry.findFirst({
    where: { id: entryId, userId },
  });
  if (!existing) return { ok: false, code: "not_found" };

  const entry = await prisma.diaryEntry.update({
    where: { id: entryId },
    data: input,
  });
  return { ok: true, entry: toDiaryEntry(entry) };
}

export type DeleteDiaryEntryResult =
  { ok: true } | { ok: false; code: DiaryEntryErrorCode };

/** Жорстке видалення — DiaryEntry, як і Goal, не має `deletedAt` у схемі
 * (DATABASE.md). */
export async function deleteDiaryEntry(
  entryId: string,
  userId: string,
): Promise<DeleteDiaryEntryResult> {
  const existing = await prisma.diaryEntry.findFirst({
    where: { id: entryId, userId },
  });
  if (!existing) return { ok: false, code: "not_found" };

  await prisma.diaryEntry.delete({ where: { id: entryId } });
  return { ok: true };
}
