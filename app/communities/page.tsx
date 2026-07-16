"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface CommunityListItem {
  id: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  memberCount: number;
}

type Status = "loading" | "success" | "error";

const DEBOUNCE_MS = 300;

export default function CommunitiesPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("loading");
  const [communities, setCommunities] = useState<CommunityListItem[]>([]);

  const trimmedQuery = query.trim();

  useEffect(() => {
    let cancelled = false;

    const timeoutId = setTimeout(() => {
      setStatus("loading");
      const url = trimmedQuery
        ? `/api/communities?q=${encodeURIComponent(trimmedQuery)}`
        : "/api/communities";
      fetch(url)
        .then(async (response) => {
          if (cancelled) return;
          if (!response.ok) {
            setStatus("error");
            return;
          }
          const data = await response.json();
          setCommunities(data.communities);
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
  }, [trimmedQuery]);

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <Card className="w-full max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <CardTitle>Спільноти</CardTitle>
            <CardDescription>Знайдіть спільноту за назвою.</CardDescription>
          </div>
          <Link href="/communities/new">
            <Button variant="secondary" size="sm">
              Нова спільнота
            </Button>
          </Link>
        </div>

        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Назва спільноти..."
          autoFocus
        />

        <div className="mt-4 flex flex-col gap-1">
          {status === "loading" && (
            <p className="py-6 text-center text-sm text-foreground/60">
              Завантажуємо...
            </p>
          )}
          {status === "error" && (
            <p className="py-6 text-center text-sm text-danger">
              Не вдалося завантажити спільноти. Спробуйте ще раз.
            </p>
          )}
          {status === "success" && communities.length === 0 && (
            <p className="py-6 text-center text-sm text-foreground/60">
              Нічого не знайдено.
            </p>
          )}
          {status === "success" &&
            communities.map((community) => (
              <Link
                key={community.id}
                href={`/communities/${community.id}`}
                className="flex items-center justify-between gap-3 rounded-card p-3 transition-colors duration-150 hover:bg-background"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {community.name}
                  </div>
                  <div className="truncate text-sm text-foreground/60">
                    {community.visibility === "public"
                      ? "Публічна"
                      : "Приватна"}{" "}
                    · {community.memberCount}{" "}
                    {community.memberCount === 1 ? "учасник" : "учасників"}
                  </div>
                </div>
              </Link>
            ))}
        </div>
      </Card>
    </div>
  );
}
