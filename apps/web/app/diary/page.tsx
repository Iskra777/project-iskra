"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSession } from "@/lib/auth/session-context";
import { useToast } from "@/components/ui/toast";

interface DiaryEntry {
  id: string;
  title: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

type Status = "loading" | "success" | "error";

function formatTimestamp(createdAt: string) {
  return new Date(createdAt).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function DiaryPage() {
  const { user, accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();

  const [status, setStatus] = useState<Status>("loading");
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadEntries = useCallback(() => {
    if (!accessToken) return;
    return fetch("/api/diary", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          setStatus("error");
          return;
        }
        const data = await response.json();
        setEntries(data.entries);
        setNextCursor(data.nextCursor);
        setStatus("success");
      })
      .catch(() => {
        setStatus("error");
      });
  }, [accessToken]);

  useEffect(() => {
    if (isSessionLoading || !user) return;
    loadEntries();
  }, [isSessionLoading, user, loadEntries]);

  async function handleLoadMore() {
    if (!nextCursor || !accessToken || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const response = await fetch(`/api/diary?before=${nextCursor}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return;
      const body = await response.json();
      setEntries((prev) => [...prev, ...body.entries]);
      setNextCursor(body.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function confirmDelete() {
    if (!entryToDelete || !accessToken) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/diary/${entryToDelete}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        toast({ title: "Не вдалося видалити запис", variant: "danger" });
        return;
      }
      setEntries((prev) => prev.filter((entry) => entry.id !== entryToDelete));
      toast({ title: "Запис видалено", variant: "success" });
      setEntryToDelete(null);
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
            Щоб переглянути щоденник, спершу увійдіть.
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
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>Щоденник</CardTitle>
            <CardDescription className="mb-6">
              Твої особисті записи — бачиш лише ти.
            </CardDescription>
          </div>
          <Link href="/diary/new">
            <Button size="sm">Новий запис</Button>
          </Link>
        </div>

        {status === "loading" && (
          <p className="py-6 text-center text-sm text-foreground/60">
            Завантажуємо...
          </p>
        )}

        {status === "error" && (
          <p className="py-6 text-center text-sm text-danger">
            Не вдалося завантажити записи. Спробуйте ще раз.
          </p>
        )}

        {status === "success" && entries.length === 0 && (
          <p className="py-6 text-center text-sm text-foreground/60">
            Ще немає записів.
          </p>
        )}

        <div className="flex flex-col">
          {status === "success" &&
            entries.map((entry) => (
              <div
                key={entry.id}
                className="border-t border-foreground/10 py-4 first:border-t-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {entry.title && (
                      <p className="truncate text-sm font-medium">
                        {entry.title}
                      </p>
                    )}
                    <span className="text-xs text-foreground/60">
                      {formatTimestamp(entry.createdAt)}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Link href={`/diary/${entry.id}/edit`}>
                      <Button variant="ghost" size="sm">
                        Редагувати
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEntryToDelete(entry.id)}
                    >
                      Видалити
                    </Button>
                  </div>
                </div>

                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">
                  {entry.content}
                </p>
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
        open={entryToDelete !== null}
        onOpenChange={(open) => !open && setEntryToDelete(null)}
      >
        <DialogContent>
          <DialogTitle>Видалити запис?</DialogTitle>
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
