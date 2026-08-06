"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSession } from "@/lib/auth/session-context";
import { useToast } from "@/components/ui/toast";

interface LearningRoom {
  id: string;
  hostId: string;
  title: string;
  description: string | null;
}

type Status = "loading" | "success" | "error";

function toNullableValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export default function LearningRoomsPage() {
  const { user, accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();

  const [status, setStatus] = useState<Status>("loading");
  const [rooms, setRooms] = useState<LearningRoom[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTitleError, setFormTitleError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadRooms = useCallback(() => {
    if (!accessToken) return;
    return fetch("/api/learning-rooms", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          setStatus("error");
          return;
        }
        const data = await response.json();
        setRooms(data.rooms);
        setNextCursor(data.nextCursor);
        setStatus("success");
      })
      .catch(() => {
        setStatus("error");
      });
  }, [accessToken]);

  useEffect(() => {
    if (isSessionLoading || !user) return;
    loadRooms();
  }, [isSessionLoading, user, loadRooms]);

  async function handleLoadMore() {
    if (!nextCursor || !accessToken || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const response = await fetch(`/api/learning-rooms?before=${nextCursor}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return;
      const body = await response.json();
      setRooms((prev) => [...prev, ...body.rooms]);
      setNextCursor(body.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }

  function openCreateForm() {
    setFormTitle("");
    setFormDescription("");
    setFormTitleError(undefined);
    setFormError(undefined);
    setIsCreateOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;

    const trimmedTitle = formTitle.trim();
    if (trimmedTitle.length === 0) {
      setFormTitleError("Назва не може бути порожньою.");
      return;
    }
    setFormTitleError(undefined);
    setFormError(undefined);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/learning-rooms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: trimmedTitle,
          description: toNullableValue(formDescription),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setFormError(
          body?.error?.message ??
            "Не вдалося створити кімнату. Спробуйте ще раз.",
        );
        return;
      }

      setIsCreateOpen(false);
      toast({ title: "Кімнату створено", variant: "success" });
      loadRooms();
    } finally {
      setIsSubmitting(false);
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
            Щоб переглянути кімнати, спершу увійдіть.
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
            <CardTitle>Навчальні кімнати</CardTitle>
            <CardDescription className="mb-6">
              Групи людей, які вчаться разом.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreateForm}>
            Створити кімнату
          </Button>
        </div>

        {status === "loading" && (
          <p className="py-6 text-center text-sm text-foreground/60">
            Завантажуємо...
          </p>
        )}

        {status === "error" && (
          <p className="py-6 text-center text-sm text-danger">
            Не вдалося завантажити кімнати. Спробуйте ще раз.
          </p>
        )}

        {status === "success" && rooms.length === 0 && (
          <p className="py-6 text-center text-sm text-foreground/60">
            Ще немає жодної кімнати.
          </p>
        )}

        <div className="flex flex-col">
          {status === "success" &&
            rooms.map((room) => (
              <Link
                key={room.id}
                href={`/learning-rooms/${room.id}`}
                className="border-t border-foreground/10 py-4 first:border-t-0 hover:bg-background"
              >
                <p className="truncate text-sm font-medium">{room.title}</p>
                {room.description && (
                  <p className="mt-1 truncate text-sm text-foreground/60">
                    {room.description}
                  </p>
                )}
              </Link>
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

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogTitle>Створити кімнату</DialogTitle>
          <DialogDescription className="mb-4">
            Кімната буде видима всім користувачам.
          </DialogDescription>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
            noValidate
          >
            <Input
              label="Назва"
              value={formTitle}
              onChange={(event) => setFormTitle(event.target.value)}
              error={formTitleError}
              maxLength={200}
            />
            <Textarea
              label="Опис"
              value={formDescription}
              onChange={(event) => setFormDescription(event.target.value)}
              maxLength={5000}
            />
            {formError && <p className="text-sm text-danger">{formError}</p>}
            <div className="flex gap-3">
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? "Зберігаємо..." : "Створити"}
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="secondary" className="flex-1">
                  Скасувати
                </Button>
              </DialogClose>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
