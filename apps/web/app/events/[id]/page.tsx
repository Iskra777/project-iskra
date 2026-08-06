"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Avatar } from "@/components/ui/avatar";
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
type AttendanceStatus = "going" | "interested";

interface EventOrganizer {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface EventDetail {
  id: string;
  organizerId: string;
  title: string;
  description: string | null;
  format: EventFormat;
  locationOrLink: string | null;
  startsAt: string;
  endsAt: string | null;
  organizer: EventOrganizer;
  viewerStatus: AttendanceStatus | "declined" | null;
}

type Status = "loading" | "success" | "not_found" | "error";

const FORMAT_LABEL: Record<EventFormat, string> = {
  online: "Онлайн",
  offline: "Офлайн",
};

const FORMAT_CLASS: Record<EventFormat, string> = {
  online: "text-primary",
  offline: "text-accent",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("uk-UA", {
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

function toDatetimeLocal(value: string) {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function EventDetailPage() {
  const { id: eventId } = useParams<{ id: string }>();
  const { user, accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();
  const router = useRouter();

  const [status, setStatus] = useState<Status>("loading");
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [isAttendancePending, setIsAttendancePending] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formFormat, setFormFormat] = useState<EventFormat>("online");
  const [formLocationOrLink, setFormLocationOrLink] = useState("");
  const [formStartsAt, setFormStartsAt] = useState("");
  const [formEndsAt, setFormEndsAt] = useState("");
  const [formTitleError, setFormTitleError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadEvent = useCallback(() => {
    if (!accessToken) return;
    return fetch(`/api/events/${eventId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (response.status === 404) {
          setStatus("not_found");
          return;
        }
        if (!response.ok) {
          setStatus("error");
          return;
        }
        const data = await response.json();
        setEvent(data.event);
        setStatus("success");
      })
      .catch(() => setStatus("error"));
  }, [accessToken, eventId]);

  useEffect(() => {
    if (isSessionLoading || !user) return;
    loadEvent();
  }, [isSessionLoading, user, loadEvent]);

  async function setAttendance(nextStatus: AttendanceStatus) {
    if (!accessToken || !event || isAttendancePending) return;
    const previousStatus = event.viewerStatus;
    setIsAttendancePending(true);
    setEvent({ ...event, viewerStatus: nextStatus });
    try {
      const response = await fetch(`/api/events/${eventId}/attendance`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) {
        setEvent((prev) =>
          prev ? { ...prev, viewerStatus: previousStatus } : prev,
        );
        toast({
          title: "Не вдалося зберегти статус участі",
          variant: "danger",
        });
      }
    } finally {
      setIsAttendancePending(false);
    }
  }

  async function cancelAttendance() {
    if (!accessToken || !event || isAttendancePending) return;
    const previousStatus = event.viewerStatus;
    setIsAttendancePending(true);
    setEvent({ ...event, viewerStatus: null });
    try {
      const response = await fetch(`/api/events/${eventId}/attendance`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        setEvent((prev) =>
          prev ? { ...prev, viewerStatus: previousStatus } : prev,
        );
        toast({ title: "Не вдалося скасувати участь", variant: "danger" });
      }
    } finally {
      setIsAttendancePending(false);
    }
  }

  function openEditForm() {
    if (!event) return;
    setFormTitle(event.title);
    setFormDescription(event.description ?? "");
    setFormFormat(event.format);
    setFormLocationOrLink(event.locationOrLink ?? "");
    setFormStartsAt(toDatetimeLocal(event.startsAt));
    setFormEndsAt(event.endsAt ? toDatetimeLocal(event.endsAt) : "");
    setFormTitleError(undefined);
    setFormError(undefined);
    setIsEditOpen(true);
  }

  async function handleEditSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
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
      const response = await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
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
            "Не вдалося зберегти зміни. Спробуйте ще раз.",
        );
        return;
      }

      setIsEditOpen(false);
      toast({ title: "Подію оновлено", variant: "success" });
      loadEvent();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!accessToken) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/events/${eventId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        toast({ title: "Не вдалося видалити подію", variant: "danger" });
        return;
      }
      toast({ title: "Подію видалено", variant: "success" });
      router.push("/events");
    } finally {
      setIsDeleting(false);
    }
  }

  if (isSessionLoading || status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-foreground/60">Завантажуємо...</p>
      </div>
    );
  }

  if (!user || !accessToken) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center md:max-w-md lg:max-w-lg xl:max-w-xl">
          <CardTitle>Потрібен вхід</CardTitle>
          <CardDescription className="mb-6">
            Щоб переглянути подію, спершу увійдіть.
          </CardDescription>
          <Link href="/login">
            <Button className="w-full">Увійти</Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-foreground/60">Подію не знайдено.</p>
      </div>
    );
  }

  if (status === "error" || !event) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-danger">
          Не вдалося завантажити подію. Спробуйте ще раз.
        </p>
      </div>
    );
  }

  const isOrganizer = event.organizerId === user.id;

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <Card className="w-full max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
        <div className="flex items-start justify-between gap-2">
          <CardTitle>{event.title}</CardTitle>
          <span
            className={cn(
              "shrink-0 text-xs font-medium",
              FORMAT_CLASS[event.format],
            )}
          >
            {FORMAT_LABEL[event.format]}
          </span>
        </div>

        <p className="mt-1 text-sm text-foreground/60">
          {formatDateTime(event.startsAt)}
          {event.endsAt && ` — ${formatDateTime(event.endsAt)}`}
        </p>

        <Link
          href={`/users/${event.organizer.username}`}
          className="mt-4 flex items-center gap-2"
        >
          <Avatar
            src={event.organizer.avatarUrl}
            alt={event.organizer.displayName ?? event.organizer.username}
            size={32}
          />
          <span className="text-sm text-foreground/80">
            {event.organizer.displayName ?? event.organizer.username}
          </span>
        </Link>

        {event.description && (
          <p className="mt-4 whitespace-pre-wrap text-sm text-foreground/80">
            {event.description}
          </p>
        )}

        {event.locationOrLink && (
          <p className="mt-4 text-sm text-foreground/80">
            {event.locationOrLink}
          </p>
        )}

        {!isOrganizer && (
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              variant={event.viewerStatus === "going" ? "primary" : "secondary"}
              disabled={isAttendancePending}
              onClick={() => setAttendance("going")}
              className="flex-1"
            >
              Іду
            </Button>
            <Button
              variant={
                event.viewerStatus === "interested" ? "primary" : "secondary"
              }
              disabled={isAttendancePending}
              onClick={() => setAttendance("interested")}
              className="flex-1"
            >
              Можливо
            </Button>
            {event.viewerStatus && (
              <Button
                variant="ghost"
                disabled={isAttendancePending}
                onClick={cancelAttendance}
                className="w-full"
              >
                Скасувати участь
              </Button>
            )}
          </div>
        )}

        {isOrganizer && (
          <div className="mt-6 flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={openEditForm}
            >
              Редагувати
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setIsDeleteOpen(true)}
            >
              Видалити
            </Button>
          </div>
        )}
      </Card>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogTitle>Редагувати подію</DialogTitle>
          <DialogDescription className="mb-4">
            Зміни побачать усі, хто має посилання на подію.
          </DialogDescription>

          <form
            onSubmit={handleEditSubmit}
            className="flex flex-col gap-4"
            noValidate
          >
            <Input
              label="Назва"
              value={formTitle}
              onChange={(formEvent) => setFormTitle(formEvent.target.value)}
              error={formTitleError}
              maxLength={200}
            />
            <Textarea
              label="Опис"
              value={formDescription}
              onChange={(formEvent) =>
                setFormDescription(formEvent.target.value)
              }
              maxLength={5000}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Формат</label>
              <select
                value={formFormat}
                onChange={(formEvent) =>
                  setFormFormat(formEvent.target.value as EventFormat)
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
              onChange={(formEvent) =>
                setFormLocationOrLink(formEvent.target.value)
              }
              maxLength={500}
            />
            <Input
              label="Початок"
              type="datetime-local"
              value={formStartsAt}
              onChange={(formEvent) => setFormStartsAt(formEvent.target.value)}
            />
            <Input
              label="Завершення (опційно)"
              type="datetime-local"
              value={formEndsAt}
              onChange={(formEvent) => setFormEndsAt(formEvent.target.value)}
            />
            {formError && <p className="text-sm text-danger">{formError}</p>}
            <div className="flex gap-3">
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? "Зберігаємо..." : "Зберегти"}
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

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogTitle>Видалити подію?</DialogTitle>
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
