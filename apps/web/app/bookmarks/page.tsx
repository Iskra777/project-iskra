"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReactionButtons } from "@/components/reaction-buttons";
import type { ReactionType } from "@/components/reaction-buttons";
import { BookmarkButton } from "@/components/bookmark-button";
import { useSession } from "@/lib/auth/session-context";
import { useToast } from "@/components/ui/toast";

interface FeedAuthor {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface FeedCommunity {
  id: string;
  name: string;
}

interface FeedPost {
  id: string;
  content: string;
  mediaUrl: string | null;
  createdAt: string;
  updatedAt: string;
  author: FeedAuthor;
  community: FeedCommunity | null;
  viewerReactions: ReactionType[];
  viewerHasBookmarked: boolean;
}

type Status = "loading" | "success" | "error";

function formatTimestamp(createdAt: string) {
  const date = new Date(createdAt);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday
    ? date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("uk-UA");
}

export default function BookmarksPage() {
  const { user, accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();

  const [status, setStatus] = useState<Status>("loading");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadBookmarks = useCallback(() => {
    if (!accessToken) return;
    return fetch("/api/bookmarks", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          setStatus("error");
          return;
        }
        const data = await response.json();
        setPosts(data.posts);
        setNextCursor(data.nextCursor);
        setStatus("success");
      })
      .catch(() => {
        setStatus("error");
      });
  }, [accessToken]);

  useEffect(() => {
    if (isSessionLoading || !user) return;
    loadBookmarks();
  }, [isSessionLoading, user, loadBookmarks]);

  async function handleLoadMore() {
    if (!nextCursor || !accessToken || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const response = await fetch(`/api/bookmarks?before=${nextCursor}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return;
      const body = await response.json();
      setPosts((prev) => [...prev, ...body.posts]);
      setNextCursor(body.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function handleToggleReaction(postId: string, type: ReactionType) {
    if (!accessToken) return;
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const isActive = post.viewerReactions.includes(type);

    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              viewerReactions: isActive
                ? p.viewerReactions.filter((t) => t !== type)
                : [...p.viewerReactions, type],
            }
          : p,
      ),
    );

    const response = await fetch(`/api/posts/${postId}/reactions/${type}`, {
      method: isActive ? "DELETE" : "PUT",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => null);

    if (!response || !response.ok) {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                viewerReactions: isActive
                  ? [...p.viewerReactions, type]
                  : p.viewerReactions.filter((t) => t !== type),
              }
            : p,
        ),
      );
      toast({ title: "Не вдалося зберегти реакцію", variant: "danger" });
    }
  }

  /** На відміну від стрічки: зняття закладки прибирає пост зі списку одразу
   * (це екран "збережене", а не перемикач видимості). */
  async function handleRemoveBookmark(postId: string) {
    if (!accessToken) return;
    const index = posts.findIndex((p) => p.id === postId);
    if (index === -1) return;
    const removedPost = posts[index];

    setPosts((prev) => prev.filter((p) => p.id !== postId));

    const response = await fetch(`/api/posts/${postId}/bookmark`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => null);

    if (!response || !response.ok) {
      setPosts((prev) => {
        const next = [...prev];
        next.splice(index, 0, removedPost);
        return next;
      });
      toast({ title: "Не вдалося прибрати закладку", variant: "danger" });
    }
  }

  async function confirmDelete() {
    if (!postToDelete || !accessToken) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/posts/${postToDelete}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        toast({ title: "Не вдалося видалити пост", variant: "danger" });
        return;
      }
      setPosts((prev) => prev.filter((post) => post.id !== postToDelete));
      toast({ title: "Пост видалено", variant: "success" });
      setPostToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  }

  if (isSessionLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-foreground/60">Завантажуємо...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center md:max-w-md lg:max-w-lg xl:max-w-xl">
          <CardTitle>Потрібен вхід</CardTitle>
          <CardDescription className="mb-6">
            Щоб переглянути закладки, спершу увійдіть.
          </CardDescription>
          <Link href="/login">
            <Button className="w-full">Увійти</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <Card className="w-full max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
        <CardTitle>Мої закладки</CardTitle>
        <CardDescription className="mb-6">
          Пости, які ти зберіг(-ла) для себе.
        </CardDescription>

        {status === "loading" && (
          <p className="py-6 text-center text-sm text-foreground/60">
            Завантажуємо...
          </p>
        )}

        {status === "error" && (
          <p className="py-6 text-center text-sm text-danger">
            Не вдалося завантажити закладки. Спробуйте ще раз.
          </p>
        )}

        {status === "success" && posts.length === 0 && (
          <p className="py-6 text-center text-sm text-foreground/60">
            Ще немає збережених постів.
          </p>
        )}

        <div className="flex flex-col">
          {status === "success" &&
            posts.map((post) => (
              <div
                key={post.id}
                className="border-t border-foreground/10 py-4 first:border-t-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Link href={`/users/${post.author.username}`}>
                      <Avatar
                        src={post.author.avatarUrl}
                        alt={post.author.displayName ?? post.author.username}
                        size={36}
                      />
                    </Link>
                    <div>
                      <Link
                        href={`/users/${post.author.username}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {post.author.displayName ?? post.author.username}
                      </Link>
                      <div className="text-xs text-foreground/60">
                        {post.community && (
                          <>
                            у{" "}
                            <Link
                              href={`/communities/${post.community.id}`}
                              className="text-primary hover:underline"
                            >
                              {post.community.name}
                            </Link>{" "}
                            ·{" "}
                          </>
                        )}
                        <Link
                          href={`/posts/${post.id}`}
                          className="hover:underline"
                        >
                          {formatTimestamp(post.createdAt)}
                        </Link>
                      </div>
                    </div>
                  </div>
                  {post.author.id === user.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPostToDelete(post.id)}
                    >
                      Видалити
                    </Button>
                  )}
                </div>

                <p className="mt-3 whitespace-pre-wrap text-sm">
                  {post.content}
                </p>

                {post.mediaUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- вже оптимізований Cloudinary webp
                  <img
                    src={post.mediaUrl}
                    alt=""
                    className="mt-3 max-h-96 w-full rounded-card object-cover"
                  />
                )}

                <div className="mt-2 flex items-center justify-between">
                  <ReactionButtons
                    activeTypes={post.viewerReactions}
                    onToggle={(type) => handleToggleReaction(post.id, type)}
                  />
                  <BookmarkButton
                    active={post.viewerHasBookmarked}
                    onToggle={() => handleRemoveBookmark(post.id)}
                  />
                </div>
              </div>
            ))}
        </div>

        {nextCursor && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Завантаження..." : "Завантажити ще"}
            </Button>
          </div>
        )}
      </Card>

      <Dialog
        open={postToDelete !== null}
        onOpenChange={(open) => !open && setPostToDelete(null)}
      >
        <DialogContent>
          <DialogTitle>Видалити пост?</DialogTitle>
          <DialogDescription className="mb-4">
            Цю дію не можна скасувати.
          </DialogDescription>
          <div className="flex gap-3">
            <Button
              variant="danger"
              className="flex-1"
              disabled={isDeleting}
              onClick={confirmDelete}
            >
              {isDeleting ? "Видаляємо..." : "Видалити"}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" className="flex-1">
                Скасувати
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
