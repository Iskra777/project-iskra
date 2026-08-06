"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";

interface SearchResult {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

type Status = "idle" | "loading" | "success" | "error";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<SearchResult[]>([]);

  const trimmedQuery = query.trim();
  const isQueryTooShort = trimmedQuery.length < MIN_QUERY_LENGTH;
  // Рендер сам показує "idle" за замалим запитом — ефект нижче не викликає
  // setState синхронно для цього випадку, лише для реальних fetch-спроб.
  const displayStatus: Status = isQueryTooShort ? "idle" : status;

  useEffect(() => {
    if (isQueryTooShort) return;

    let cancelled = false;

    const timeoutId = setTimeout(() => {
      setStatus("loading");
      fetch(`/api/users/search?q=${encodeURIComponent(trimmedQuery)}`)
        .then(async (response) => {
          if (cancelled) return;
          if (!response.ok) {
            setStatus("error");
            return;
          }
          const data = await response.json();
          setResults(data.users);
          setStatus("success");
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [trimmedQuery, isQueryTooShort]);

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <Card className="w-full max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
        <CardTitle>Пошук користувачів</CardTitle>
        <CardDescription className="mb-6">
          Знайдіть інших учасників за іменем або username.
        </CardDescription>

        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ім'я або username..."
          autoFocus
        />

        <div className="mt-4 flex flex-col gap-1">
          {displayStatus === "idle" && (
            <p className="py-6 text-center text-sm text-foreground/60">
              Введіть щонайменше {MIN_QUERY_LENGTH} символи, щоб почати пошук.
            </p>
          )}
          {displayStatus === "loading" && (
            <p className="py-6 text-center text-sm text-foreground/60">
              Шукаємо...
            </p>
          )}
          {displayStatus === "error" && (
            <p className="py-6 text-center text-sm text-danger">
              Не вдалося виконати пошук. Спробуйте ще раз.
            </p>
          )}
          {displayStatus === "success" && results.length === 0 && (
            <p className="py-6 text-center text-sm text-foreground/60">
              Нічого не знайдено.
            </p>
          )}
          {displayStatus === "success" &&
            results.map((user) => (
              <Link
                key={user.id}
                href={`/users/${user.username}`}
                className="flex items-center gap-3 rounded-card p-3 transition-colors duration-150 hover:bg-background"
              >
                <Avatar
                  src={user.avatarUrl}
                  alt={user.displayName ?? user.username}
                  size={40}
                />
                <div>
                  <div className="text-sm font-medium">
                    {user.displayName ?? user.username}
                  </div>
                  <div className="text-sm text-foreground/60">
                    @{user.username}
                  </div>
                </div>
              </Link>
            ))}
        </div>
      </Card>
    </div>
  );
}
