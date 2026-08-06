import { prisma } from "@/lib/prisma";
import { canViewPost } from "@/lib/feed";

export type ReactionType = "fire" | "bulb" | "clap";

export type ReactionErrorCode = "not_found";

export type ReactionResult =
  { ok: true } | { ok: false; code: ReactionErrorCode };

/** Видимість — та сама, що й коментування ({@link canViewPost}); хто бачить
 * пост, той і може реагувати. */
async function findVisiblePost(postId: string, viewerId: string) {
  const post = await prisma.post.findFirst({
    where: { id: postId, deletedAt: null },
  });
  if (!post) return null;
  return (await canViewPost(viewerId, post)) ? post : null;
}

/** Видимість коментаря = видимість його поста — коментарі не мають
 * власного рівня приватності. */
async function findVisibleComment(commentId: string, viewerId: string) {
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, deletedAt: null },
    include: { post: true },
  });
  if (!comment) return null;
  return (await canViewPost(viewerId, comment.post)) ? comment : null;
}

/** Ідемпотентне "поставити" — `upsert`, повторний виклик нічого не ламає.
 * Без лічильника в результаті (PRINCIPLES.md, принцип 7) — лише факт дії. */
export async function setPostReaction(
  postId: string,
  userId: string,
  type: ReactionType,
): Promise<ReactionResult> {
  const post = await findVisiblePost(postId, userId);
  if (!post) return { ok: false, code: "not_found" };

  await prisma.postReaction.upsert({
    where: { postId_userId_type: { postId, userId, type } },
    create: { postId, userId, type },
    update: {},
  });

  return { ok: true };
}

/** Ідемпотентне "зняти" — `deleteMany` не кидає помилку, якщо реакції й не було. */
export async function removePostReaction(
  postId: string,
  userId: string,
  type: ReactionType,
): Promise<ReactionResult> {
  const post = await findVisiblePost(postId, userId);
  if (!post) return { ok: false, code: "not_found" };

  await prisma.postReaction.deleteMany({ where: { postId, userId, type } });

  return { ok: true };
}

export async function setCommentReaction(
  commentId: string,
  userId: string,
  type: ReactionType,
): Promise<ReactionResult> {
  const comment = await findVisibleComment(commentId, userId);
  if (!comment) return { ok: false, code: "not_found" };

  await prisma.commentReaction.upsert({
    where: { commentId_userId_type: { commentId, userId, type } },
    create: { commentId, userId, type },
    update: {},
  });

  return { ok: true };
}

export async function removeCommentReaction(
  commentId: string,
  userId: string,
  type: ReactionType,
): Promise<ReactionResult> {
  const comment = await findVisibleComment(commentId, userId);
  if (!comment) return { ok: false, code: "not_found" };

  await prisma.commentReaction.deleteMany({
    where: { commentId, userId, type },
  });

  return { ok: true };
}
