"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { useSession } from "@/lib/auth/session-context";
import { useToast } from "@/components/ui/toast";

interface FriendRequest {
  id: string;
  createdAt: string;
  requester: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

type Status = "loading" | "success" | "error";

export default function FriendRequestsPage() {
  const { user, accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();

  const [status, setStatus] = useState<Status>("loading");
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  useEffect(() => {
    if (isSessionLoading || !accessToken) return;

    let cancelled = false;

    fetch("/api/users/me/friend-requests", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setStatus("error");
          return;
        }
        const data = await response.json();
        setRequests(data.requests);
        setStatus("success");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, isSessionLoading]);

  async function handleRespond(
    request: FriendRequest,
    action: "accept" | "reject",
  ) {
    setRespondingId(request.id);
    try {
      const response = await fetch(
        `/api/users/${request.requester.username}/friend-request`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ action }),
        },
      );
      if (!response.ok) {
        toast({ title: "Не вдалося виконати дію", variant: "danger" });
        return;
      }
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
      toast({
        title: action === "accept" ? "Запит прийнято" : "Запит відхилено",
        variant: "success",
      });
    } catch {
      toast({ title: "Немає з'єднання із сервером", variant: "danger" });
    } finally {
      setRespondingId(null);
    }
  }

  if (isSessionLoading || status === "loading") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center md:max-w-md lg:max-w-lg xl:max-w-xl">
          <CardTitle>Завантажуємо...</CardTitle>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center md:max-w-md lg:max-w-lg xl:max-w-xl">
          <CardTitle>Потрібен вхід</CardTitle>
          <CardDescription className="mb-6">
            Щоб переглянути запити дружби, спершу увійдіть.
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
        <CardTitle>Запити дружби</CardTitle>
        <CardDescription className="mb-6">
          Люди, які хочуть додати тебе в друзі.
        </CardDescription>

        {status === "error" && (
          <p className="py-6 text-center text-sm text-danger">
            Не вдалося завантажити запити. Спробуйте ще раз.
          </p>
        )}

        {status === "success" && requests.length === 0 && (
          <p className="py-6 text-center text-sm text-foreground/60">
            Немає нових запитів.
          </p>
        )}

        <div className="flex flex-col gap-1">
          {status === "success" &&
            requests.map((request) => (
              <div
                key={request.id}
                className="flex items-center gap-3 rounded-card p-3"
              >
                <Link
                  href={`/users/${request.requester.username}`}
                  className="flex flex-1 items-center gap-3"
                >
                  <Avatar
                    src={request.requester.avatarUrl}
                    alt={
                      request.requester.displayName ??
                      request.requester.username
                    }
                    size={40}
                  />
                  <div>
                    <div className="text-sm font-medium">
                      {request.requester.displayName ??
                        request.requester.username}
                    </div>
                    <div className="text-sm text-foreground/60">
                      @{request.requester.username}
                    </div>
                  </div>
                </Link>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={respondingId === request.id}
                    onClick={() => handleRespond(request, "accept")}
                  >
                    Прийняти
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={respondingId === request.id}
                    onClick={() => handleRespond(request, "reject")}
                  >
                    Відхилити
                  </Button>
                </div>
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}
