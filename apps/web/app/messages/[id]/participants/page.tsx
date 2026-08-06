"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/auth/session-context";
import { useToast } from "@/components/ui/toast";

interface Participant {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
}

interface SearchResult {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

type Status = "loading" | "success" | "not_found" | "error";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

export default function GroupParticipantsPage() {
  const { id: conversationId } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();

  const [status, setStatus] = useState<Status>("loading");
  const [title, setTitle] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [successorPicker, setSuccessorPicker] = useState(false);
  const [chosenSuccessor, setChosenSuccessor] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [toAdd, setToAdd] = useState<Map<string, SearchResult>>(new Map());
  const [isAdding, setIsAdding] = useState(false);

  const load = useCallback(() => {
    if (!accessToken) return;
    return fetch(`/api/conversations/${conversationId}`, {
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
      if (data.conversation.type !== "group") {
        setStatus("not_found");
        return;
      }
      setTitle(data.conversation.title);
      setParticipants(data.conversation.participants);
      setStatus("success");
    });
  }, [accessToken, conversationId]);

  useEffect(() => {
    if (isSessionLoading || !accessToken) return;
    load();
  }, [isSessionLoading, accessToken, load]);

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

  const isAdmin = participants.find((p) => p.id === user?.id)?.role === "admin";
  const existingIds = new Set(participants.map((p) => p.id));

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

  async function handleAdd() {
    if (toAdd.size === 0 || !accessToken) return;
    setIsAdding(true);
    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/participants`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            usernames: [...toAdd.values()].map((u) => u.username),
          }),
        },
      );
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

  async function handlePromote(targetUserId: string) {
    if (!accessToken) return;
    setBusyUserId(targetUserId);
    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/participants/${targetUserId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ role: "admin" }),
        },
      );
      if (!response.ok) {
        toast({ title: "Не вдалося призначити адміном", variant: "danger" });
        return;
      }
      toast({ title: "Тепер адмін групи", variant: "success" });
      await load();
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRemove(targetUserId: string) {
    if (!accessToken) return;
    setBusyUserId(targetUserId);
    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/participants/${targetUserId}`,
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

  async function attemptLeave(newAdminUserId?: string) {
    if (!accessToken) return;
    setIsLeaving(true);
    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/leave`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(newAdminUserId ? { newAdminUserId } : {}),
        },
      );
      const body = await response.json();
      if (response.ok) {
        toast({ title: "Ти вийшов з групи", variant: "success" });
        router.push("/messages");
        return;
      }
      if (body.error?.code === "admin_required") {
        setSuccessorPicker(true);
        return;
      }
      toast({ title: "Не вдалося вийти з групи", variant: "danger" });
    } finally {
      setIsLeaving(false);
    }
  }

  if (isSessionLoading || status === "loading") {
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
            Щоб керувати учасниками, спершу увійдіть.
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
        <p className="text-sm text-foreground/60">Групу не знайдено.</p>
        <Link href="/messages">
          <Button variant="secondary" size="sm">
            До списку розмов
          </Button>
        </Link>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-danger">
          Не вдалося завантажити групу. Спробуйте ще раз.
        </p>
      </div>
    );
  }

  const otherParticipants = participants.filter((p) => p.id !== user.id);

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <Card className="w-full max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
        <div className="mb-2 flex items-center gap-3">
          <Link href={`/messages/${conversationId}`}>
            <Button variant="ghost" size="sm">
              ←
            </Button>
          </Link>
          <div>
            <CardTitle>Учасники</CardTitle>
            <CardDescription>{title}</CardDescription>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-1">
          {participants.map((participant) => {
            const isSelf = participant.id === user.id;
            return (
              <div
                key={participant.id}
                className="flex flex-col gap-2 rounded-card p-2"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar
                    src={participant.avatarUrl}
                    alt={participant.displayName ?? participant.username}
                    size={36}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {participant.displayName ?? participant.username}
                      {isSelf && " (ти)"}
                    </div>
                    <div className="text-xs text-foreground/60">
                      {participant.role === "admin" ? "Адмін" : "Учасник"}
                    </div>
                  </div>
                </div>
                {isAdmin && !isSelf && (
                  <div className="flex flex-wrap gap-2 pl-[3.375rem]">
                    {participant.role !== "admin" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busyUserId === participant.id}
                        onClick={() => handlePromote(participant.id)}
                      >
                        Зробити адміном
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busyUserId === participant.id}
                      onClick={() => handleRemove(participant.id)}
                    >
                      Видалити
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isAdmin && (
          <div className="mt-6">
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
                onClick={handleAdd}
              >
                {isAdding ? "Додаємо..." : "Додати"}
              </Button>
            )}
          </div>
        )}

        <Dialog open={successorPicker} onOpenChange={setSuccessorPicker}>
          <Button
            variant="danger"
            className="mt-8 w-full"
            disabled={isLeaving}
            onClick={() => attemptLeave()}
          >
            {isLeaving ? "Виходимо..." : "Вийти з групи"}
          </Button>
          <DialogContent>
            <DialogTitle>Передай права адміна</DialogTitle>
            <DialogDescription className="mb-4">
              Ти єдиний адмін групи. Перш ніж вийти, оберіть, кому передати
              права.
            </DialogDescription>
            <div className="flex flex-col gap-1">
              {otherParticipants.map((participant) => (
                <label
                  key={participant.id}
                  className="flex cursor-pointer items-center gap-3 rounded-card p-2 hover:bg-background"
                >
                  <input
                    type="radio"
                    name="successor"
                    checked={chosenSuccessor === participant.id}
                    onChange={() => setChosenSuccessor(participant.id)}
                  />
                  <Avatar
                    src={participant.avatarUrl}
                    alt={participant.displayName ?? participant.username}
                    size={32}
                  />
                  <span className="text-sm">
                    {participant.displayName ?? participant.username}
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex gap-3">
              <Button
                className="flex-1"
                disabled={!chosenSuccessor || isLeaving}
                onClick={() => {
                  if (chosenSuccessor) {
                    setSuccessorPicker(false);
                    attemptLeave(chosenSuccessor);
                  }
                }}
              >
                Передати й вийти
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="secondary" className="flex-1">
                  Скасувати
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  );
}
