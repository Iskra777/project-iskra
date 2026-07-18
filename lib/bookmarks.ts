import { prisma } from "@/lib/prisma";
import { canViewPost } from "@/lib/feed";

export type BookmarkErrorCode = "not_found";

export type BookmarkResult =
  { ok: true } | { ok: false; code: BookmarkErrorCode };

async function findVisiblePost(postId: string, viewerId: string) {
  const post = await prisma.post.findFirst({
    where: { id: postId, deletedAt: null },
  });
  if (!post) return null;
  return (await canViewPost(viewerId, post)) ? post : null;
}

/** Ідемпотентне "додати" — `upsert`, повторний виклик нічого не ламає. */
export async function setBookmark(
  postId: string,
  userId: string,
): Promise<BookmarkResult> {
  const post = await findVisiblePost(postId, userId);
  if (!post) return { ok: false, code: "not_found" };

  await prisma.bookmark.upsert({
    where: { userId_postId: { userId, postId } },
    create: { userId, postId },
    update: {},
  });

  return { ok: true };
}

/** Ідемпотентне "прибрати" — `deleteMany` не кидає помилку, якщо закладки й не було. */
export async function removeBookmark(
  postId: string,
  userId: string,
): Promise<BookmarkResult> {
  const post = await findVisiblePost(postId, userId);
  if (!post) return { ok: false, code: "not_found" };

  await prisma.bookmark.deleteMany({ where: { userId, postId } });

  return { ok: true };
}
