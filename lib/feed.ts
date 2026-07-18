import { prisma } from "@/lib/prisma";
import type { ReactionType } from "@/lib/reactions";

export interface FeedAuthor {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface FeedCommunity {
  id: string;
  name: string;
}

export interface FeedPost {
  id: string;
  content: string;
  mediaUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: FeedAuthor;
  community: FeedCommunity | null;
  /** Типи, якими сам глядач уже відреагував — не чужі реакції, без
   * лічильника (PRINCIPLES.md, принцип 7). */
  viewerReactions: ReactionType[];
  /** Чи глядач сам додав цей пост у закладки. */
  viewerHasBookmarked: boolean;
}

/** Один запит на весь список постів (не N+1). */
export async function getViewerPostReactions(
  viewerId: string,
  postIds: string[],
): Promise<Map<string, ReactionType[]>> {
  if (postIds.length === 0) return new Map();

  const rows = await prisma.postReaction.findMany({
    where: { userId: viewerId, postId: { in: postIds } },
    select: { postId: true, type: true },
  });

  const map = new Map<string, ReactionType[]>();
  for (const row of rows) {
    const existing = map.get(row.postId) ?? [];
    existing.push(row.type);
    map.set(row.postId, existing);
  }
  return map;
}

/** Той самий батчинг, що й {@link getViewerPostReactions}, для закладок. */
export async function getViewerBookmarkedPostIds(
  viewerId: string,
  postIds: string[],
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();

  const rows = await prisma.bookmark.findMany({
    where: { userId: viewerId, postId: { in: postIds } },
    select: { postId: true },
  });

  return new Set(rows.map((row) => row.postId));
}

export const authorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

export const communitySelect = { id: true, name: true } as const;

export async function getFriendIds(userId: string): Promise<string[]> {
  const friendships = await prisma.friendship.findMany({
    where: {
      status: "accepted",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { requesterId: true, addresseeId: true },
  });
  return friendships.map((f) =>
    f.requesterId === userId ? f.addresseeId : f.requesterId,
  );
}

export async function getApprovedCommunityIds(
  userId: string,
): Promise<string[]> {
  const memberships = await prisma.communityMember.findMany({
    where: { userId, status: "approved" },
    select: { communityId: true },
  });
  return memberships.map((m) => m.communityId);
}

/**
 * Видимі глядачу пости: власні + `accepted`-друзів на профілі, плюс усі
 * пости зі спільнот, де глядач `approved`-учасник (незалежно від автора —
 * інакше приватна спільнота витікала б через дружбу з її учасником).
 */
export function feedWhere(
  viewerId: string,
  friendIds: string[],
  communityIds: string[],
) {
  return {
    deletedAt: null,
    OR: [
      { communityId: null, authorId: { in: [viewerId, ...friendIds] } },
      ...(communityIds.length > 0
        ? [{ communityId: { in: communityIds } }]
        : []),
    ],
  };
}

/**
 * Видимість одного конкретного поста для {@link getPost} (lib/posts.ts) —
 * та сама логіка, що й {@link feedWhere}, але як точковий запит замість
 * побудови списку "усе видиме глядачу" (для одиночного перегляду
 * ефективніше, ніж тягнути повні списки друзів/спільнот).
 */
export async function canViewPost(
  viewerId: string,
  post: { authorId: string; communityId: string | null },
): Promise<boolean> {
  if (post.communityId) {
    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: { communityId: post.communityId, userId: viewerId },
      },
    });
    return membership?.status === "approved";
  }

  if (post.authorId === viewerId) {
    return true;
  }

  const friendship = await prisma.friendship.findFirst({
    where: {
      status: "accepted",
      OR: [
        { requesterId: viewerId, addresseeId: post.authorId },
        { requesterId: post.authorId, addresseeId: viewerId },
      ],
    },
  });
  return friendship !== null;
}

export type GetFeedErrorCode = "invalid_cursor";

export type GetFeedResult =
  | { ok: true; posts: FeedPost[]; nextCursor: string | null }
  | { ok: false; code: GetFeedErrorCode };

/**
 * Курсорна пагінація, той самий підхід, що й історія повідомлень
 * (lib за app/api/conversations/:id/messages) — `createdAt`+`id` для
 * стабільного tie-break, курсор перевіряється заздалегідь у межах видимих
 * постів (Prisma інакше шукає курсор глобально, поза фільтром `where`).
 */
export async function getFeed(
  viewerId: string,
  before: string | null,
  limit: number,
): Promise<GetFeedResult> {
  const [friendIds, communityIds] = await Promise.all([
    getFriendIds(viewerId),
    getApprovedCommunityIds(viewerId),
  ]);
  const where = feedWhere(viewerId, friendIds, communityIds);

  if (before) {
    const cursorPost = await prisma.post.findFirst({
      where: { id: before, ...where },
    });
    if (!cursorPost) {
      return { ok: false, code: "invalid_cursor" };
    }
  }

  const posts = await prisma.post.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    include: {
      author: { select: authorSelect },
      community: { select: communitySelect },
    },
  });

  const nextCursor = posts.length === limit ? posts[posts.length - 1].id : null;

  const postIds = posts.map((post) => post.id);
  const [reactionsByPostId, bookmarkedPostIds] = await Promise.all([
    getViewerPostReactions(viewerId, postIds),
    getViewerBookmarkedPostIds(viewerId, postIds),
  ]);

  return {
    ok: true,
    posts: posts.map((post) => ({
      id: post.id,
      content: post.content,
      mediaUrl: post.mediaUrl,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      author: post.author,
      community: post.community,
      viewerReactions: reactionsByPostId.get(post.id) ?? [],
      viewerHasBookmarked: bookmarkedPostIds.has(post.id),
    })),
    nextCursor,
  };
}
