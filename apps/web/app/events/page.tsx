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
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth/session-context";
import { useToast } from "@/components/ui/toast";

type EventFormat = "online" | "offline";

interface Event {
  id: string;
  organizerId: string;
  title: string;
  description: string | null;
  format: EventFormat;
  locationOrLink: string | null;
  startsAt: string;
  endsAt: string | null;
}

type Status = "loading" | "success" | "error";

const FORMAT_LABEL: Record<EventFormat, string> = {
  online: "Онлайн",
  offline: "Офлайн",
};

const FORMAT_CLASS: Record<EventFormat, string> = {
  online: "text-primary",
  offline: "text-accent",
};

function formatStartsAt(startsAt: string) {
  return new Date(startsAt).toLocaleString("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toNullableValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export default function EventsPage() {
  const { user, accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();

  const [status, setStatus] = useState<Status>("loading");
  const [events, setEvents] = useState<Event[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formFormat, setFormFormat] = useState<EventFormat>("online");
  const [formLocationOrLink, setFormLocationOrLink] = useState("");
  const [formStartsAt, setFormStartsAt] = useState("");
  const [formEndsAt, setFormEndsAt] = useState("");
  const [formTitleError, setFormTitleError] = useState<string | undefined>();
  const [formStartsAtError, setFormStartsAtError] = useState<
    string | undefined
  >();
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadEvents = useCallback(() => {
    if (!accessToken) return;
    return fetch("/api/events", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          setStatus("error");
          return;
        }
        const data = await response.json();
        setEvents(data.events);
        setNextCursor(data.nextCursor);
        setStatus("success");
      })
      .catch(() => {
        setStatus("error");
      });
  }, [accessToken]);

  useEffect(() => {
    if (isSessionLoading || !user) return;
    loadEvents();
  }, [isSessionLoading, user, loadEvents]);

  async function handleLoadMore() {
    if (!nextCursor || !accessToken || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const response = await fetch(`/api/events?after=${nextCursor}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return;
      const body = await response.json();
      setEvents((prev) => [...prev, ...body.events]);
      setNextCursor(body.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }

  function openCreateForm() {
    setFormTitle("");
    setFormDescription("");
    setFormFormat("online");
    setFormLocationOrLink("");
    setFormStartsAt("");
    setFormEndsAt("");
    setFormTitleError(undefined);
    setFormStartsAtError(undefined);
    setFormError(undefined);
    setIsCreateOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;

    const trimmedTitle = formTitle.trim();
    let hasError = false;
    if (trimmedTitle.length === 0) {
      setFormTitleError("Назва не може бути порожньою.");
      hasError = true;
    } else {
      setFormTitleError(undefined);
    }
    if (formStartsAt === "") {
      setFormStartsAtError("Вкажіть дату й час початку.");
      hasError = true;
    } else {
      setFormStartsAtError(undefined);
    }
    if (hasError) return;

    setFormError(undefined);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: trimmedTitle,
          description: toNullableValue(formDescription),
          format: formFormat,
          locationOrLink: toNullableValue(formLocationOrLink),
          startsAt: new Date(formStartsAt).toISOString(),
          endsAt: formEndsAt === "" ? null : new Date(formEndsAt).toISOString(),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setFormError(
          body?.error?.message ??
            "Не вдалося створити подію. Спробуйте ще раз.",
        );
        return;
      }

      setIsCreateOpen(false);
      toast({ title: "Подію створено", variant: "success" });
      loadEvents();
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
            Щоб переглянути події, спершу увійдіть.
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
            <CardTitle>Події</CardTitle>
            <CardDescription className="mb-6">
              Найближчі події спільноти.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreateForm}>
            Створити подію
          </Button>
        </div>

        {status === "loading" && (
          <p className="py-6 text-center text-sm text-foreground/60">
            Завантажуємо...
          </p>
        )}

        {status === "error" && (
          <p className="py-6 text-center text-sm text-danger">
            Не вдалося завантажити події. Спробуйте ще раз.
          </p>
        )}

        {status === "success" && events.length === 0 && (
          <p className="py-6 text-center text-sm text-foreground/60">
            Ще немає запланованих подій.
          </p>
        )}

        <div className="flex flex-col">
          {status === "success" &&
            events.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="border-t border-foreground/10 py-4 first:border-t-0 hover:bg-background"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium">{event.title}</p>
                  <span
                    className={cn(
                      "shrink-0 text-xs font-medium",
                      FORMAT_CLASS[event.format],
                    )}
                  >
                    {FORMAT_LABEL[event.format]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-foreground/60">
                  {formatStartsAt(event.startsAt)}
                </p>
                {event.locationOrLink && (
                  <p className="mt-1 truncate text-sm text-foreground/80">
                    {event.locationOrLink}
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
          <DialogTitle>Створити подію</DialogTitle>
          <DialogDescription className="mb-4">
            Подія буде видима всім користувачам.
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
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Формат</label>
              <select
                value={formFormat}
                onChange={(event) =>
                  setFormFormat(event.target.value as EventFormat)
                }
                className="h-10 rounded-card border border-foreground/15 bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <option value="online">Онлайн</option>
                <option value="offline">Офлайн</option>
              </select>
            </div>
            <Input
              label="Місце або посилання"
              value={formLocationOrLink}
              onChange={(event) => setFormLocationOrLink(event.target.value)}
              maxLength={500}
            />
            <Input
              label="Початок"
              type="datetime-local"
              value={formStartsAt}
              onChange={(event) => setFormStartsAt(event.target.value)}
              error={formStartsAtError}
            />
            <Input
              label="Завершення (опційно)"
              type="datetime-local"
              value={formEndsAt}
              onChange={(event) => setFormEndsAt(event.target.value)}
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
