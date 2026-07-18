import { prisma } from "@/lib/prisma";
import {
  authorSelect,
  canViewPost,
  communitySelect,
  feedWhere,
  getApprovedCommunityIds,
  getFriendIds,
  getViewerPostReactions,
  type FeedPost,
} from "@/lib/feed";

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

export type GetBookmarksErrorCode = "invalid_cursor";

export type GetBookmarksResult =
  | { ok: true; posts: FeedPost[]; nextCursor: string | null }
  | { ok: false; code: GetBookmarksErrorCode };

/**
 * Список закладок глядача, найновіші (за часом додавання в закладки, не
 * поста) перші. Пости, чия видимість відтоді зникла (вийшов зі спільноти,
 * розірвана дружба) або які м'яко видалено, мовчки не показуються — сам
 * рядок Bookmark при цьому не чиститься (post_id — ON DELETE RESTRICT).
 */
export async function getBookmarks(
  viewerId: string,
  before: string | null,
  limit: number,
): Promise<GetBookmarksResult> {
  const [friendIds, communityIds] = await Promise.all([
    getFriendIds(viewerId),
    getApprovedCommunityIds(viewerId),
  ]);
  const postWhere = feedWhere(viewerId, friendIds, communityIds);
  const where = { userId: viewerId, post: postWhere };

  if (before) {
    const cursorBookmark = await prisma.bookmark.findFirst({
      where: { id: before, ...where },
    });
    if (!cursorBookmark) {
      return { ok: false, code: "invalid_cursor" };
    }
  }

  const bookmarks = await prisma.bookmark.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    include: {
      post: {
        include: {
          author: { select: authorSelect },
          community: { select: communitySelect },
        },
      },
    },
  });

  const nextCursor =
    bookmarks.length === limit ? bookmarks[bookmarks.length - 1].id : null;

  const reactionsByPostId = await getViewerPostReactions(
    viewerId,
    bookmarks.map((bookmark) => bookmark.postId),
  );

  return {
    ok: true,
    posts: bookmarks.map(({ post }) => ({
      id: post.id,
      content: post.content,
      mediaUrl: post.mediaUrl,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      author: post.author,
      community: post.community,
      viewerReactions: reactionsByPostId.get(post.id) ?? [],
      viewerHasBookmarked: true,
    })),
    nextCursor,
  };
}
