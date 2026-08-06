"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
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

interface CommentReply {
  id: string;
  content: string;
  createdAt: string;
  author: FeedAuthor;
  viewerReactions: ReactionType[];
}

interface CommentWithReplies extends CommentReply {
  replies: CommentReply[];
}

type Status = "loading" | "success" | "not_found" | "error";

function formatTimestamp(createdAt: string) {
  const date = new Date(createdAt);
  return date.toLocaleString("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortTimestamp(createdAt: string) {
  const date = new Date(createdAt);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday
    ? date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("uk-UA");
}

export default function PostPage() {
  const { id: postId } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();

  const [status, setStatus] = useState<Status>("loading");
  const [post, setPost] = useState<FeedPost | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [comments, setComments] = useState<CommentWithReplies[]>([]);
  const [newCommentContent, setNewCommentContent] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  const [commentToDelete, setCommentToDelete] = useState<string | null>(null);
  const [isDeletingComment, setIsDeletingComment] = useState(false);

  const loadComments = useCallback(() => {
    if (!accessToken) return;
    return fetch(`/api/posts/${postId}/comments`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      setComments(data.comments);
    });
  }, [accessToken, postId]);

  const load = useCallback(() => {
    if (!accessToken) return;
    return fetch(`/api/posts/${postId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(async (response) => {
      if (response.status === 404) {
        setStatus("not_found");
        return;
      }
      if (!response.ok) {
        setStatus("error");
        return;
      }
      const data = await response.json();
      setPost(data.post);
      setStatus("success");
      await loadComments();
    });
  }, [accessToken, postId, loadComments]);

  useEffect(() => {
    if (isSessionLoading || !accessToken) return;
    load();
  }, [isSessionLoading, accessToken, load]);

  async function confirmDelete() {
    if (!accessToken) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        toast({ title: "Не вдалося видалити пост", variant: "danger" });
        return;
      }
      toast({ title: "Пост видалено", variant: "success" });
      router.push("/");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleAddComment() {
    if (!accessToken || newCommentContent.trim().length === 0) return;
    setIsSubmittingComment(true);
    try {
      const response = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ content: newCommentContent.trim() }),
      });
      if (!response.ok) {
        toast({ title: "Не вдалося додати коментар", variant: "danger" });
        return;
      }
      setNewCommentContent("");
      await loadComments();
    } finally {
      setIsSubmittingComment(false);
    }
  }

  async function handleAddReply(parentCommentId: string) {
    if (!accessToken || replyContent.trim().length === 0) return;
    setIsSubmittingReply(true);
    try {
      const response = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          content: replyContent.trim(),
          parentCommentId,
        }),
      });
      if (!response.ok) {
        toast({ title: "Не вдалося додати відповідь", variant: "danger" });
        return;
      }
      setReplyContent("");
      setReplyingToId(null);
      await loadComments();
    } finally {
      setIsSubmittingReply(false);
    }
  }

  async function confirmDeleteComment() {
    if (!accessToken || !commentToDelete) return;
    setIsDeletingComment(true);
    try {
      const response = await fetch(`/api/comments/${commentToDelete}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        toast({ title: "Не вдалося видалити коментар", variant: "danger" });
        return;
      }
      toast({ title: "Коментар видалено", variant: "success" });
      setCommentToDelete(null);
      await loadComments();
    } finally {
      setIsDeletingComment(false);
    }
  }

  async function handleTogglePostReaction(type: ReactionType) {
    if (!accessToken || !post) return;
    const isActive = post.viewerReactions.includes(type);

    setPost((prev) =>
      prev
        ? {
            ...prev,
            viewerReactions: isActive
              ? prev.viewerReactions.filter((t) => t !== type)
              : [...prev.viewerReactions, type],
          }
        : prev,
    );

    const response = await fetch(`/api/posts/${postId}/reactions/${type}`, {
      method: isActive ? "DELETE" : "PUT",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => null);

    if (!response || !response.ok) {
      setPost((prev) =>
        prev
          ? {
              ...prev,
              viewerReactions: isActive
                ? [...prev.viewerReactions, type]
                : prev.viewerReactions.filter((t) => t !== type),
            }
          : prev,
      );
      toast({ title: "Не вдалося зберегти реакцію", variant: "danger" });
    }
  }

  async function handleTogglePostBookmark() {
    if (!accessToken || !post) return;
    const wasBookmarked = post.viewerHasBookmarked;

    setPost((prev) =>
      prev ? { ...prev, viewerHasBookmarked: !wasBookmarked } : prev,
    );

    const response = await fetch(`/api/posts/${postId}/bookmark`, {
      method: wasBookmarked ? "DELETE" : "PUT",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => null);

    if (!response || !response.ok) {
      setPost((prev) =>
        prev ? { ...prev, viewerHasBookmarked: wasBookmarked } : prev,
      );
      toast({ title: "Не вдалося зберегти закладку", variant: "danger" });
    }
  }

  function updateCommentReactions(
    commentId: string,
    updater: (reactions: ReactionType[]) => ReactionType[],
  ) {
    setComments((prev) =>
      prev.map((comment) => {
        if (comment.id === commentId) {
          return {
            ...comment,
            viewerReactions: updater(comment.viewerReactions),
          };
        }
        return {
          ...comment,
          replies: comment.replies.map((reply) =>
            reply.id === commentId
              ? { ...reply, viewerReactions: updater(reply.viewerReactions) }
              : reply,
          ),
        };
      }),
    );
  }

  async function handleToggleCommentReaction(
    commentId: string,
    type: ReactionType,
  ) {
    if (!accessToken) return;
    const allComments = comments.flatMap((comment) => [
      comment,
      ...comment.replies,
    ]);
    const target = allComments.find((comment) => comment.id === commentId);
    if (!target) return;
    const isActive = target.viewerReactions.includes(type);

    updateCommentReactions(commentId, (reactions) =>
      isActive ? reactions.filter((t) => t !== type) : [...reactions, type],
    );

    const response = await fetch(
      `/api/comments/${commentId}/reactions/${type}`,
      {
        method: isActive ? "DELETE" : "PUT",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    ).catch(() => null);

    if (!response || !response.ok) {
      updateCommentReactions(commentId, (reactions) =>
        isActive ? [...reactions, type] : reactions.filter((t) => t !== type),
      );
      toast({ title: "Не вдалося зберегти реакцію", variant: "danger" });
    }
  }

  if (isSessionLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-foreground/60">Завантажуємо...</p>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center md:max-w-md lg:max-w-lg xl:max-w-xl">
          <CardTitle>Потрібен вхід</CardTitle>
          <CardDescription className="mb-6">
            Щоб переглянути пост, спершу увійдіть.
          </CardDescription>
          <Link href="/login">
            <Button className="w-full">Увійти</Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-foreground/60">Завантажуємо...</p>
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-foreground/60">Пост не знайдено.</p>
      </div>
    );
  }

  if (status === "error" || !post) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-danger">
          Не вдалося завантажити пост. Спробуйте ще раз.
        </p>
      </div>
    );
  }

  function renderComment(comment: CommentReply, isReply: boolean) {
    return (
      <div key={comment.id} className="flex items-start gap-3">
        <Link href={`/users/${comment.author.username}`}>
          <Avatar
            src={comment.author.avatarUrl}
            alt={comment.author.displayName ?? comment.author.username}
            size={32}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <Link
                href={`/users/${comment.author.username}`}
                className="text-sm font-medium hover:underline"
              >
                {comment.author.displayName ?? comment.author.username}
              </Link>
              <span className="ml-2 text-xs text-foreground/60">
                {formatShortTimestamp(comment.createdAt)}
              </span>
            </div>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-sm">
            {comment.content}
          </p>
          <div className="mt-1 flex items-center gap-3">
            <ReactionButtons
              activeTypes={comment.viewerReactions}
              onToggle={(type) => handleToggleCommentReaction(comment.id, type)}
            />
            {!isReply && (
              <button
                type="button"
                onClick={() => {
                  setReplyingToId(comment.id);
                  setReplyContent("");
                }}
                className="text-xs text-foreground/60 hover:text-foreground hover:underline"
              >
                Відповісти
              </button>
            )}
            {comment.author.id === user?.id && (
              <button
                type="button"
                onClick={() => setCommentToDelete(comment.id)}
                className="text-xs text-foreground/60 hover:text-danger hover:underline"
              >
                Видалити
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <Card className="w-full max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link href={`/users/${post.author.username}`}>
              <Avatar
                src={post.author.avatarUrl}
                alt={post.author.displayName ?? post.author.username}
                size={44}
              />
            </Link>
            <div>
              <Link
                href={`/users/${post.author.username}`}
                className="font-medium hover:underline"
              >
                <CardTitle className="mb-0">
                  {post.author.displayName ?? post.author.username}
                </CardTitle>
              </Link>
              <CardDescription>
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
                {formatTimestamp(post.createdAt)}
              </CardDescription>
            </div>
          </div>
          {post.author.id === user?.id && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsDeleteOpen(true)}
            >
              Видалити
            </Button>
          )}
        </div>

        <p className="mt-4 whitespace-pre-wrap">{post.content}</p>

        {post.mediaUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- вже оптимізований Cloudinary webp
          <img
            src={post.mediaUrl}
            alt=""
            className="mt-4 max-h-[32rem] w-full rounded-card object-cover"
          />
        )}

        <div className="mt-3 flex items-center justify-between">
          <ReactionButtons
            activeTypes={post.viewerReactions}
            onToggle={handleTogglePostReaction}
          />
          <BookmarkButton
            active={post.viewerHasBookmarked}
            onToggle={handleTogglePostBookmark}
          />
        </div>
      </Card>

      <Card className="mt-4 w-full max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
        <CardTitle>Коментарі</CardTitle>

        <div className="mt-4 flex flex-col gap-2">
          <Textarea
            value={newCommentContent}
            onChange={(event) => setNewCommentContent(event.target.value)}
            placeholder="Написати коментар..."
            maxLength={5000}
          />
          <Button
            size="sm"
            className="self-end"
            disabled={
              newCommentContent.trim().length === 0 || isSubmittingComment
            }
            onClick={handleAddComment}
          >
            {isSubmittingComment ? "Надсилаємо..." : "Надіслати"}
          </Button>
        </div>

        {comments.length === 0 && (
          <p className="mt-6 text-center text-sm text-foreground/60">
            Ще немає коментарів. Будь першим.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-4">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="border-t border-foreground/10 pt-4 first:border-t-0 first:pt-0"
            >
              {renderComment(comment, false)}

              {replyingToId === comment.id && (
                <div className="ml-11 mt-2 flex flex-col gap-2">
                  <Textarea
                    value={replyContent}
                    onChange={(event) => setReplyContent(event.target.value)}
                    placeholder="Написати відповідь..."
                    maxLength={5000}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setReplyingToId(null)}
                    >
                      Скасувати
                    </Button>
                    <Button
                      size="sm"
                      disabled={
                        replyContent.trim().length === 0 || isSubmittingReply
                      }
                      onClick={() => handleAddReply(comment.id)}
                    >
                      {isSubmittingReply ? "Надсилаємо..." : "Надіслати"}
                    </Button>
                  </div>
                </div>
              )}

              {comment.replies.length > 0 && (
                <div className="ml-11 mt-3 flex flex-col gap-3">
                  {comment.replies.map((reply) => renderComment(reply, true))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
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

      <Dialog
        open={commentToDelete !== null}
        onOpenChange={(open) => !open && setCommentToDelete(null)}
      >
        <DialogContent>
          <DialogTitle>Видалити коментар?</DialogTitle>
          <DialogDescription className="mb-4">
            Цю дію не можна скасувати.
          </DialogDescription>
          <div className="flex gap-3">
            <Button
              variant="danger"
              className="flex-1"
              disabled={isDeletingComment}
              onClick={confirmDeleteComment}
            >
              {isDeletingComment ? "Видаляємо..." : "Видалити"}
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
