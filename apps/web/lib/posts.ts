import { prisma } from "@/lib/prisma";
import { findMembership } from "@/lib/communities";
import {
  authorSelect,
  canViewPost,
  communitySelect,
  getViewerBookmarkedPostIds,
  getViewerPostReactions,
} from "@/lib/feed";
import type { FeedPost } from "@/lib/feed";

export type CreatePostErrorCode = "community_not_found" | "forbidden";

export type CreatePostResult =
  { ok: true; postId: string } | { ok: false; code: CreatePostErrorCode };

/**
 * `communityId: null` — пост на профілі автора, завжди дозволено. Якщо
 * вказано спільноту, автор має бути її `approved`-учасником — той самий
 * підхід, що й надсилання повідомлення (учасник розмови) в
 * lib/conversations.ts.
 */
export async function createPost(
  authorId: string,
  content: string,
  communityId: string | null,
  mediaUrl: string | null = null,
): Promise<CreatePostResult> {
  if (communityId) {
    const community = await prisma.community.findUnique({
      where: { id: communityId },
    });
    if (!community) {
      return { ok: false, code: "community_not_found" };
    }

    const membership = await findMembership(communityId, authorId);
    if (!membership || membership.status !== "approved") {
      return { ok: false, code: "forbidden" };
    }
  }

  const post = await prisma.post.create({
    data: { authorId, communityId, content, mediaUrl },
  });

  return { ok: true, postId: post.id };
}

export type PostMutationErrorCode = "not_found" | "forbidden";

function findLivePost(postId: string) {
  return prisma.post.findFirst({ where: { id: postId, deletedAt: null } });
}

export type GetPostErrorCode = "not_found";

export type GetPostResult =
  { ok: true; post: FeedPost } | { ok: false; code: GetPostErrorCode };

/**
 * Одиночний перегляд для GET /api/posts/:id. Видимість — та сама, що й у
 * стрічці ({@link canViewPost}, lib/feed.ts): пряме посилання не має
 * обходити приватність друзів/спільнот. Немає доступу → та сама відповідь,
 * що й "не існує" (anti-enumeration, як і приватні спільноти).
 */
export async function getPost(
  postId: string,
  viewerId: string,
): Promise<GetPostResult> {
  const post = await prisma.post.findFirst({
    where: { id: postId, deletedAt: null },
    include: {
      author: { select: authorSelect },
      community: { select: communitySelect },
    },
  });
  if (!post) {
    return { ok: false, code: "not_found" };
  }

  const visible = await canViewPost(viewerId, post);
  if (!visible) {
    return { ok: false, code: "not_found" };
  }

  const [reactionsByPostId, bookmarkedPostIds] = await Promise.all([
    getViewerPostReactions(viewerId, [post.id]),
    getViewerBookmarkedPostIds(viewerId, [post.id]),
  ]);

  return {
    ok: true,
    post: {
      id: post.id,
      content: post.content,
      mediaUrl: post.mediaUrl,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      author: post.author,
      community: post.community,
      viewerReactions: reactionsByPostId.get(post.id) ?? [],
      viewerHasBookmarked: bookmarkedPostIds.has(post.id),
    },
  };
}

export type EditPostResult =
  | { ok: true; content: string; mediaUrl: string | null; updatedAt: Date }
  | { ok: false; code: PostMutationErrorCode };

/**
 * Лише автор може редагувати — без модерації спільноти (адмін/модератор
 * не можуть чіпати чужі пости, це поза обсягом цієї задачі). `mediaUrl`
 * не передано (`undefined`) — не чіпати поле; `null` — прибрати
 * зображення без видалення всього поста.
 */
export async function editPost(
  postId: string,
  actorId: string,
  content: string,
  mediaUrl?: string | null,
): Promise<EditPostResult> {
  const post = await findLivePost(postId);
  if (!post) {
    return { ok: false, code: "not_found" };
  }
  if (post.authorId !== actorId) {
    return { ok: false, code: "forbidden" };
  }

  const updated = await prisma.post.update({
    where: { id: postId },
    data: { content, ...(mediaUrl !== undefined ? { mediaUrl } : {}) },
  });

  return {
    ok: true,
    content: updated.content,
    mediaUrl: updated.mediaUrl,
    updatedAt: updated.updatedAt,
  };
}

export type DeletePostResult =
  { ok: true } | { ok: false; code: PostMutationErrorCode };

/** М'яке видалення (`deletedAt`), той самий підхід, що й Message/User. */
export async function deletePost(
  postId: string,
  actorId: string,
): Promise<DeletePostResult> {
  const post = await findLivePost(postId);
  if (!post) {
    return { ok: false, code: "not_found" };
  }
  if (post.authorId !== actorId) {
    return { ok: false, code: "forbidden" };
  }

  await prisma.post.update({
    where: { id: postId },
    data: { deletedAt: new Date() },
  });

  return { ok: true };
}
