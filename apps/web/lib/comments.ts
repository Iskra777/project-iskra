import { prisma } from "@/lib/prisma";
import { authorSelect, canViewPost } from "@/lib/feed";
import type { FeedAuthor } from "@/lib/feed";
import type { ReactionType } from "@/lib/reactions";

export type CreateCommentErrorCode =
  "post_not_found" | "parent_not_found" | "nested_reply_not_allowed";

export type CreateCommentResult =
  { ok: true; commentId: string } | { ok: false; code: CreateCommentErrorCode };

/**
 * Хто бачить пост (`canViewPost`, lib/feed.ts) — той і може коментувати,
 * без окремої перевірки членства. `parentCommentId` — лише коментар
 * верхнього рівня цього ж поста (дворівневі треди, DATABASE.md#comment →
 * Рішення дизайну); відповідь на відповідь відхиляється, а не мовчазно
 * сплющується.
 */
export async function createComment(
  postId: string,
  authorId: string,
  content: string,
  parentCommentId: string | null = null,
): Promise<CreateCommentResult> {
  const post = await prisma.post.findFirst({
    where: { id: postId, deletedAt: null },
  });
  if (!post) {
    return { ok: false, code: "post_not_found" };
  }

  const visible = await canViewPost(authorId, post);
  if (!visible) {
    return { ok: false, code: "post_not_found" };
  }

  if (parentCommentId) {
    const parent = await prisma.comment.findFirst({
      where: { id: parentCommentId, postId, deletedAt: null },
    });
    if (!parent) {
      return { ok: false, code: "parent_not_found" };
    }
    if (parent.parentCommentId !== null) {
      return { ok: false, code: "nested_reply_not_allowed" };
    }
  }

  const comment = await prisma.comment.create({
    data: { postId, authorId, content, parentCommentId },
  });

  return { ok: true, commentId: comment.id };
}

export interface CommentReply {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author: FeedAuthor;
  viewerReactions: ReactionType[];
}

export interface CommentWithReplies extends CommentReply {
  replies: CommentReply[];
}

/** Один запит на весь список коментарів+відповідей (не N+1). */
async function getViewerCommentReactions(
  viewerId: string,
  commentIds: string[],
): Promise<Map<string, ReactionType[]>> {
  if (commentIds.length === 0) return new Map();

  const rows = await prisma.commentReaction.findMany({
    where: { userId: viewerId, commentId: { in: commentIds } },
    select: { commentId: true, type: true },
  });

  const map = new Map<string, ReactionType[]>();
  for (const row of rows) {
    const existing = map.get(row.commentId) ?? [];
    existing.push(row.type);
    map.set(row.commentId, existing);
  }
  return map;
}

export type ListCommentsErrorCode = "post_not_found";

export type ListCommentsResult =
  | { ok: true; comments: CommentWithReplies[] }
  | { ok: false; code: ListCommentsErrorCode };

/**
 * Та сама видимість, що й коментування ({@link canViewPost}). Видалені
 * коментарі (і їхні відповіді) просто не показуються — спрощення обсягу,
 * не плейсхолдер "[видалено]" зі збереженою гілкою.
 */
export async function listComments(
  postId: string,
  viewerId: string,
): Promise<ListCommentsResult> {
  const post = await prisma.post.findFirst({
    where: { id: postId, deletedAt: null },
  });
  if (!post) {
    return { ok: false, code: "post_not_found" };
  }

  const visible = await canViewPost(viewerId, post);
  if (!visible) {
    return { ok: false, code: "post_not_found" };
  }

  const topLevel = await prisma.comment.findMany({
    where: { postId, parentCommentId: null, deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: authorSelect },
      replies: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        include: { author: { select: authorSelect } },
      },
    },
  });

  const allCommentIds = topLevel.flatMap((comment) => [
    comment.id,
    ...comment.replies.map((reply) => reply.id),
  ]);
  const reactionsByCommentId = await getViewerCommentReactions(
    viewerId,
    allCommentIds,
  );

  return {
    ok: true,
    comments: topLevel.map((comment) => ({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      author: comment.author,
      viewerReactions: reactionsByCommentId.get(comment.id) ?? [],
      replies: comment.replies.map((reply) => ({
        id: reply.id,
        content: reply.content,
        createdAt: reply.createdAt,
        updatedAt: reply.updatedAt,
        author: reply.author,
        viewerReactions: reactionsByCommentId.get(reply.id) ?? [],
      })),
    })),
  };
}

export type CommentMutationErrorCode = "not_found" | "forbidden";

function findLiveComment(commentId: string) {
  return prisma.comment.findFirst({
    where: { id: commentId, deletedAt: null },
  });
}

export type EditCommentResult =
  | { ok: true; content: string; updatedAt: Date }
  | { ok: false; code: CommentMutationErrorCode };

/** Лише автор може редагувати — той самий підхід, що й пости
 * (lib/posts.ts#editPost), без модерації спільноти. */
export async function editComment(
  commentId: string,
  actorId: string,
  content: string,
): Promise<EditCommentResult> {
  const comment = await findLiveComment(commentId);
  if (!comment) {
    return { ok: false, code: "not_found" };
  }
  if (comment.authorId !== actorId) {
    return { ok: false, code: "forbidden" };
  }

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { content },
  });

  return { ok: true, content: updated.content, updatedAt: updated.updatedAt };
}

export type DeleteCommentResult =
  { ok: true } | { ok: false; code: CommentMutationErrorCode };

/**
 * М'яке видалення. Відповіді на цей коментар не видаляються й не
 * блокуються — гілка лишається, сам коментар показуватиметься як
 * видалений (питання UI, не цієї задачі).
 */
export async function deleteComment(
  commentId: string,
  actorId: string,
): Promise<DeleteCommentResult> {
  const comment = await findLiveComment(commentId);
  if (!comment) {
    return { ok: false, code: "not_found" };
  }
  if (comment.authorId !== actorId) {
    return { ok: false, code: "forbidden" };
  }

  await prisma.comment.update({
    where: { id: commentId },
    data: { deletedAt: new Date() },
  });

  return { ok: true };
}
