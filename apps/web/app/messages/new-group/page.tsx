"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/auth/session-context";
import { useToast } from "@/components/ui/toast";

interface SearchResult {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const MIN_INVITEES = 2;

export default function NewGroupPage() {
  const router = useRouter();
  const { user, accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<Map<string, SearchResult>>(
    new Map(),
  );
  const [isCreating, setIsCreating] = useState(false);

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

  function toggleSelected(candidate: SearchResult) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(candidate.id)) {
        next.delete(candidate.id);
      } else {
        next.set(candidate.id, candidate);
      }
      return next;
    });
  }

  const canSubmit =
    title.trim().length > 0 && selected.size >= MIN_INVITEES && !isCreating;

  async function handleCreate() {
    if (!canSubmit || !accessToken) return;

    setIsCreating(true);
    try {
      const response = await fetch("/api/conversations/group", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          usernames: [...selected.values()].map((u) => u.username),
        }),
      });
      if (!response.ok) {
        toast({ title: "Не вдалося створити групу", variant: "danger" });
        return;
      }
      const body = await response.json();
      router.push(`/messages/${body.conversation.id}`);
    } catch {
      toast({ title: "Немає з'єднання із сервером", variant: "danger" });
    } finally {
      setIsCreating(false);
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
            Щоб створити групу, спершу увійдіть.
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
        <CardTitle>Нова група</CardTitle>
        <CardDescription className="mb-6">
          Назва й мінімум {MIN_INVITEES} учасники.
        </CardDescription>

        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Назва групи"
          maxLength={100}
        />

        {selected.size > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {[...selected.values()].map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => toggleSelected(person)}
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
          className="mt-4"
        />

        <div className="mt-2 flex flex-col gap-1">
          {!canSearch && (
            <p className="py-4 text-center text-sm text-foreground/60">
              Введіть щонайменше {MIN_QUERY_LENGTH} символи, щоб шукати.
            </p>
          )}
          {canSearch && isSearching && (
            <p className="py-4 text-center text-sm text-foreground/60">
              Шукаємо...
            </p>
          )}
          {canSearch &&
            !isSearching &&
            results
              .filter((r) => r.id !== user.id)
              .map((candidate) => (
                <label
                  key={candidate.id}
                  className="flex cursor-pointer items-center gap-3 rounded-card p-2 transition-colors duration-150 hover:bg-background"
                >
                  <Checkbox
                    label=""
                    checked={selected.has(candidate.id)}
                    onChange={() => toggleSelected(candidate)}
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

        <Button
          className="mt-6 w-full"
          disabled={!canSubmit}
          onClick={handleCreate}
        >
          {isCreating ? "Створюємо..." : "Створити групу"}
        </Button>
      </Card>
    </div>
  );
}
