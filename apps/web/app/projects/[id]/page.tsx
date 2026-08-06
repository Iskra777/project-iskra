"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

type ProjectStatus = "planning" | "active" | "completed" | "archived";
type MemberRole = "admin" | "member";

interface ProjectMember {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: MemberRole;
}

interface ProjectDetail {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  members: ProjectMember[];
  viewerRole: MemberRole;
}

interface SearchResult {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

type Status = "loading" | "success" | "not_found" | "error";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Планування",
  active: "Активний",
  completed: "Завершено",
  archived: "Архів",
};

const STATUS_OPTIONS: ProjectStatus[] = [
  "planning",
  "active",
  "completed",
  "archived",
];

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

function toNullableValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export default function ProjectDetailPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();

  const [status, setStatus] = useState<Status>("loading");
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formStatus, setFormStatus] = useState<ProjectStatus>("planning");
  const [formTitleError, setFormTitleError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [toAdd, setToAdd] = useState<Map<string, SearchResult>>(new Map());
  const [isAdding, setIsAdding] = useState(false);

  const load = useCallback(() => {
    if (!accessToken) return;
    return fetch(`/api/projects/${projectId}`, {
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
        setProject(data.project);
        setStatus("success");
      })
      .catch(() => setStatus("error"));
  }, [accessToken, projectId]);

  useEffect(() => {
    if (isSessionLoading || !accessToken) return;
    load();
  }, [isSessionLoading, accessToken, load]);

  const existingIds = new Set(project?.members.map((m) => m.id) ?? []);
  const trimmedQuery = query.trim();
  const canSearch = trimmedQuery.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!canSearch) return;

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      setIsSearching(true);
      fetch(`/api/users/search?q=${encodeURIComponent(trimmedQuery)}`)
        .then(async (response) => {
          if (cancelled || !response.ok) return;
          const data = await response.json();
          setResults(data.users);
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [trimmedQuery, canSearch]);

  function toggleToAdd(candidate: SearchResult) {
    setToAdd((prev) => {
      const next = new Map(prev);
      if (next.has(candidate.id)) {
        next.delete(candidate.id);
      } else {
        next.set(candidate.id, candidate);
      }
      return next;
    });
  }

  async function handleAddMembers() {
    if (toAdd.size === 0 || !accessToken) return;
    setIsAdding(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userIds: [...toAdd.keys()] }),
      });
      if (!response.ok) {
        toast({ title: "Не вдалося додати учасників", variant: "danger" });
        return;
      }
      setToAdd(new Map());
      setQuery("");
      toast({ title: "Учасників додано", variant: "success" });
      await load();
    } finally {
      setIsAdding(false);
    }
  }

  async function handleChangeRole(targetUserId: string, newRole: MemberRole) {
    if (!accessToken) return;
    setBusyUserId(targetUserId);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/members/${targetUserId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ role: newRole }),
        },
      );
      if (!response.ok) {
        toast({ title: "Не вдалося змінити роль", variant: "danger" });
        return;
      }
      toast({ title: "Роль оновлено", variant: "success" });
      await load();
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRemoveMember(targetUserId: string) {
    if (!accessToken) return;
    setBusyUserId(targetUserId);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/members/${targetUserId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!response.ok) {
        toast({ title: "Не вдалося видалити учасника", variant: "danger" });
        return;
      }
      toast({ title: "Учасника видалено", variant: "success" });
      await load();
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleLeave() {
    if (!accessToken || !user) return;
    setIsLeaving(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/members/${user.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!response.ok) {
        toast({ title: "Не вдалося покинути проєкт", variant: "danger" });
        return;
      }
      toast({ title: "Ти покинув(-ла) проєкт", variant: "success" });
      router.push("/projects");
    } finally {
      setIsLeaving(false);
    }
  }

  function openEditForm() {
    if (!project) return;
    setFormTitle(project.title);
    setFormDescription(project.description ?? "");
    setFormStatus(project.status);
    setFormTitleError(undefined);
    setFormError(undefined);
    setIsEditOpen(true);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
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
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: trimmedTitle,
          description: toNullableValue(formDescription),
          status: formStatus,
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
      toast({ title: "Проєкт оновлено", variant: "success" });
      await load();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!accessToken) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        toast({ title: "Не вдалося видалити проєкт", variant: "danger" });
        return;
      }
      toast({ title: "Проєкт видалено", variant: "success" });
      router.push("/projects");
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
            Щоб переглянути проєкт, спершу увійдіть.
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
        <p className="text-sm text-foreground/60">Проєкт не знайдено.</p>
      </div>
    );
  }

  if (status === "error" || !project) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-danger">
          Не вдалося завантажити проєкт. Спробуйте ще раз.
        </p>
      </div>
    );
  }

  const isOwner = project.ownerId === user.id;
  const isAdmin = project.viewerRole === "admin";

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <Card className="w-full max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <CardTitle>{project.title}</CardTitle>
            <CardDescription>{STATUS_LABEL[project.status]}</CardDescription>
          </div>
          {isAdmin && (
            <Button variant="secondary" size="sm" onClick={openEditForm}>
              Редагувати
            </Button>
          )}
        </div>

        {project.description && (
          <p className="mb-4 text-sm text-foreground/80">
            {project.description}
          </p>
        )}

        <div className="mb-6">
          <div className="mb-2 text-sm font-medium">Учасники</div>
          <div className="flex flex-col gap-1">
            {project.members.map((member) => {
              const isMemberOwner = member.id === project.ownerId;
              return (
                <div
                  key={member.id}
                  className="flex flex-col gap-2 rounded-card p-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Link
                      href={`/users/${member.username}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <Avatar
                        src={member.avatarUrl}
                        alt={member.displayName ?? member.username}
                        size={36}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {member.displayName ?? member.username}
                          {member.id === user.id && " (ти)"}
                        </div>
                        <div className="text-xs text-foreground/60">
                          {isMemberOwner
                            ? "Власник"
                            : member.role === "admin"
                              ? "Адмін"
                              : "Учасник"}
                        </div>
                      </div>
                    </Link>
                  </div>
                  {isAdmin && !isMemberOwner && member.id !== user.id && (
                    <div className="flex flex-wrap gap-2 pl-[3.375rem]">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busyUserId === member.id}
                        onClick={() =>
                          handleChangeRole(
                            member.id,
                            member.role === "admin" ? "member" : "admin",
                          )
                        }
                      >
                        {member.role === "admin"
                          ? "Зробити учасником"
                          : "Зробити адміном"}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={busyUserId === member.id}
                        onClick={() => handleRemoveMember(member.id)}
                      >
                        Видалити
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {isAdmin && (
          <div className="mb-6">
            <div className="mb-2 text-sm font-medium">Додати учасників</div>
            {toAdd.size > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {[...toAdd.values()].map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => toggleToAdd(person)}
                    className="flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-sm text-primary transition-colors duration-150 hover:bg-primary/25"
                  >
                    {person.displayName ?? person.username}
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Знайти людей за іменем або username..."
            />
            <div className="mt-2 flex flex-col gap-1">
              {canSearch && isSearching && (
                <p className="py-2 text-center text-sm text-foreground/60">
                  Шукаємо...
                </p>
              )}
              {canSearch &&
                !isSearching &&
                results
                  .filter((r) => r.id !== user.id && !existingIds.has(r.id))
                  .map((candidate) => (
                    <label
                      key={candidate.id}
                      className="flex cursor-pointer items-center gap-3 rounded-card p-2 transition-colors duration-150 hover:bg-background"
                    >
                      <Checkbox
                        label=""
                        checked={toAdd.has(candidate.id)}
                        onChange={() => toggleToAdd(candidate)}
                      />
                      <Avatar
                        src={candidate.avatarUrl}
                        alt={candidate.displayName ?? candidate.username}
                        size={32}
                      />
                      <span className="text-sm">
                        {candidate.displayName ?? candidate.username}
                      </span>
                    </label>
                  ))}
            </div>
            {toAdd.size > 0 && (
              <Button
                className="mt-3 w-full"
                disabled={isAdding}
                onClick={handleAddMembers}
              >
                {isAdding ? "Додаємо..." : "Додати"}
              </Button>
            )}
          </div>
        )}

        {isOwner && (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setIsDeleteOpen(true)}
          >
            Видалити проєкт
          </Button>
        )}

        {!isOwner && (
          <Button
            variant="secondary"
            className="w-full"
            disabled={isLeaving}
            onClick={handleLeave}
          >
            {isLeaving ? "Виходимо..." : "Покинути проєкт"}
          </Button>
        )}
      </Card>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogTitle>Редагувати проєкт</DialogTitle>
          <DialogDescription className="mb-4">
            Зміни побачать усі учасники.
          </DialogDescription>

          <form
            onSubmit={handleEditSubmit}
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
              <label className="text-sm font-medium">Статус</label>
              <select
                value={formStatus}
                onChange={(event) =>
                  setFormStatus(event.target.value as ProjectStatus)
                }
                className="h-10 rounded-card border border-foreground/15 bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {STATUS_LABEL[option]}
                  </option>
                ))}
              </select>
            </div>
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
          <DialogTitle>Видалити проєкт?</DialogTitle>
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
