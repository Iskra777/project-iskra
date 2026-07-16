"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { ReactionButtons } from "@/components/reaction-buttons";
import type { ReactionType } from "@/components/reaction-buttons";
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
}

type Status = "loading" | "success" | "error";

function formatTimestamp(createdAt: string) {
  const date = new Date(createdAt);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday
    ? date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("uk-UA");
}

function LoggedOutHero() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="flex items-center gap-2 text-foreground">
        Iskra
        <Zap className="h-8 w-8 fill-accent text-accent" />
      </h1>
      <p className="max-w-md text-foreground/70 md:max-w-lg md:text-lg">
        One Spark Can Change Everything.
      </p>
    </div>
  );
}

export default function Home() {
  const { user, accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<Status>("loading");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [content, setContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadFeed = useCallback(() => {
    if (!accessToken) return;
    return fetch("/api/feed", {
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
    loadFeed();
  }, [isSessionLoading, user, loadFeed]);

  async function handleLoadMore() {
    if (!nextCursor || !accessToken || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const response = await fetch(`/api/feed?before=${nextCursor}`, {
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

  async function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !accessToken) return;

    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.set("image", file);
      const response = await fetch("/api/posts/media", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });
      if (!response.ok) {
        toast({
          title: "Не вдалося завантажити зображення",
          variant: "danger",
        });
        return;
      }
      const body = await response.json();
      setMediaUrl(body.mediaUrl);
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function handlePublish() {
    if (!accessToken || !user || content.trim().length === 0 || isPosting) {
      return;
    }
    setIsPosting(true);
    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ content: content.trim(), mediaUrl }),
      });
      if (!response.ok) {
        toast({ title: "Не вдалося опублікувати пост", variant: "danger" });
        return;
      }
      const body = await response.json();
      const now = new Date().toISOString();
      const newPost: FeedPost = {
        id: body.post.id,
        content: content.trim(),
        mediaUrl,
        createdAt: now,
        updatedAt: now,
        author: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
        community: null,
        viewerReactions: [],
      };
      setPosts((prev) => [newPost, ...prev]);
      setContent("");
      setMediaUrl(null);
      toast({ title: "Пост опубліковано", variant: "success" });
    } finally {
      setIsPosting(false);
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
      // відкат при помилці
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
    return <LoggedOutHero />;
  }

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <Card className="w-full max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
        <CardTitle>Стрічка</CardTitle>
        <CardDescription className="mb-6">
          Пости від тебе, друзів і твоїх спільнот.
        </CardDescription>

        <div className="mb-6">
          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Що нового?"
            maxLength={5000}
          />

          {mediaUrl && (
            <div className="relative mt-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- вже оптимізований Cloudinary webp */}
              <img
                src={mediaUrl}
                alt="Вибране зображення"
                className="max-h-72 w-full rounded-card object-cover"
              />
              <button
                type="button"
                onClick={() => setMediaUrl(null)}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-foreground transition-colors duration-150 hover:bg-background"
                aria-label="Прибрати зображення"
              >
                ×
              </button>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImageChange}
              className="hidden"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isUploadingImage}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploadingImage ? "Завантажуємо..." : "Додати фото"}
            </Button>
            <Button
              disabled={content.trim().length === 0 || isPosting}
              onClick={handlePublish}
            >
              {isPosting ? "Публікуємо..." : "Опублікувати"}
            </Button>
          </div>
        </div>

        {status === "loading" && (
          <p className="py-6 text-center text-sm text-foreground/60">
            Завантажуємо...
          </p>
        )}

        {status === "error" && (
          <p className="py-6 text-center text-sm text-danger">
            Не вдалося завантажити стрічку. Спробуйте ще раз.
          </p>
        )}

        {status === "success" && posts.length === 0 && (
          <p className="py-6 text-center text-sm text-foreground/60">
            Стрічка порожня. Додай друзів або вступи в спільноту.
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

                <div className="mt-2">
                  <ReactionButtons
                    activeTypes={post.viewerReactions}
                    onToggle={(type) => handleToggleReaction(post.id, type)}
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
