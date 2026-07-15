"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { useSession } from "@/lib/auth/session-context";

interface Friend {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

type Status = "loading" | "success" | "error";

export default function FriendsPage() {
  const { user, accessToken, isLoading: isSessionLoading } = useSession();

  const [status, setStatus] = useState<Status>("loading");
  const [friends, setFriends] = useState<Friend[]>([]);

  useEffect(() => {
    if (isSessionLoading || !accessToken) return;

    let cancelled = false;

    fetch("/api/users/me/friends", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setStatus("error");
          return;
        }
        const data = await response.json();
        setFriends(data.friends);
        setStatus("success");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, isSessionLoading]);

  if (isSessionLoading || status === "loading") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center">
          <CardTitle>Завантажуємо...</CardTitle>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center">
          <CardTitle>Потрібен вхід</CardTitle>
          <CardDescription className="mb-6">
            Щоб переглянути друзів, спершу увійдіть.
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
      <Card className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <CardTitle>Друзі</CardTitle>
            <CardDescription>Люди, з якими ти в друзях.</CardDescription>
          </div>
          <Link href="/friends/requests">
            <Button variant="secondary" size="sm">
              Запити дружби
            </Button>
          </Link>
        </div>

        {status === "error" && (
          <p className="py-6 text-center text-sm text-danger">
            Не вдалося завантажити друзів. Спробуйте ще раз.
          </p>
        )}

        {status === "success" && friends.length === 0 && (
          <p className="py-6 text-center text-sm text-foreground/60">
            Ще немає друзів.
          </p>
        )}

        <div className="flex flex-col gap-1">
          {status === "success" &&
            friends.map((friend) => (
              <Link
                key={friend.id}
                href={`/users/${friend.username}`}
                className="flex items-center gap-3 rounded-card p-3 transition-colors duration-150 hover:bg-background"
              >
                <Avatar
                  src={friend.avatarUrl}
                  alt={friend.displayName ?? friend.username}
                  size={40}
                />
                <div>
                  <div className="text-sm font-medium">
                    {friend.displayName ?? friend.username}
                  </div>
                  <div className="text-sm text-foreground/60">
                    @{friend.username}
                  </div>
                </div>
              </Link>
            ))}
        </div>
      </Card>
    </div>
  );
}
