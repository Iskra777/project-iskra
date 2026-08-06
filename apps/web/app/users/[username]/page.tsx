"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { useSession } from "@/lib/auth/session-context";
import { useToast } from "@/components/ui/toast";

type FriendshipStatus =
  | "none"
  | "pending_sent"
  | "pending_received"
  | "accepted"
  | "blocked_by_viewer"
  | "blocked_by_other"
  | undefined;

interface PublicProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  location: string | null;
  createdAt: string;
  friendshipStatus: FriendshipStatus;
}

type Status = "loading" | "success" | "not_found";

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const router = useRouter();
  const { accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();

  const [status, setStatus] = useState<Status>("loading");
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [isStartingChat, setIsStartingChat] = useState(false);

  const loadProfile = useCallback(() => {
    return fetch(`/api/users/${params.username}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
      .then(async (response) => {
        if (!response.ok) {
          setStatus("not_found");
          return;
        }
        const data = await response.json();
        setProfile(data.user);
        setStatus("success");
      })
      .catch(() => {
        setStatus("not_found");
      });
  }, [params.username, accessToken]);

  useEffect(() => {
    // Чекаємо завершення відновлення сесії, щоб, якщо це власний профіль,
    // запит одразу пішов із access-токеном — інакше короткочасно показали б
    // публічну версію навіть власнику.
    if (isSessionLoading) return;

    let cancelled = false;
    loadProfile().then(() => {
      if (cancelled) return;
    });

    return () => {
      cancelled = true;
    };
  }, [isSessionLoading, loadProfile]);

  async function performAction(
    request: () => Promise<Response>,
    successMessage: string,
  ) {
    setIsActing(true);
    try {
      const response = await request();
      if (!response.ok) {
        toast({ title: "Не вдалося виконати дію", variant: "danger" });
        return;
      }
      toast({ title: successMessage, variant: "success" });
      await loadProfile();
    } catch {
      toast({ title: "Немає з'єднання із сервером", variant: "danger" });
    } finally {
      setIsActing(false);
    }
  }

  function sendRequest() {
    return performAction(
      () =>
        fetch(`/api/users/${params.username}/friend-request`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      "Запит дружби надіслано",
    );
  }

  function respondToRequest(action: "accept" | "reject") {
    return performAction(
      () =>
        fetch(`/api/users/${params.username}/friend-request`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ action }),
        }),
      action === "accept" ? "Запит прийнято" : "Запит відхилено",
    );
  }

  async function startChat() {
    setIsStartingChat(true);
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ username: params.username }),
      });
      if (!response.ok) {
        toast({ title: "Не вдалося почати розмову", variant: "danger" });
        return;
      }
      const body = await response.json();
      router.push(`/messages/${body.conversation.id}`);
    } catch {
      toast({ title: "Немає з'єднання із сервером", variant: "danger" });
    } finally {
      setIsStartingChat(false);
    }
  }

  function removeRelationship(successMessage: string) {
    return performAction(
      () =>
        fetch(`/api/users/${params.username}/friendship`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      successMessage,
    );
  }

  if (status === "loading") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center md:max-w-md lg:max-w-lg xl:max-w-xl">
          <CardTitle>Завантажуємо...</CardTitle>
        </Card>
      </div>
    );
  }

  if (status === "not_found" || !profile) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center md:max-w-md lg:max-w-lg xl:max-w-xl">
          <CardTitle>Користувача не знайдено</CardTitle>
          <CardDescription>
            Такого профілю не існує, або він більше не доступний.
          </CardDescription>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <Card className="w-full max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl">
        <Avatar
          src={profile.avatarUrl}
          alt={profile.displayName ?? profile.username}
          size={80}
          className="mb-4"
        />
        <CardTitle>{profile.displayName ?? profile.username}</CardTitle>
        <CardDescription className="mb-6">@{profile.username}</CardDescription>

        <div className="flex flex-col gap-3 text-sm">
          {profile.bio && (
            <div>
              <span className="text-foreground/60">Про себе: </span>
              {profile.bio}
            </div>
          )}
          {profile.location && (
            <div>
              <span className="text-foreground/60">Локація: </span>
              {profile.location}
            </div>
          )}
          <div>
            <span className="text-foreground/60">З нами з: </span>
            {new Date(profile.createdAt).toLocaleDateString("uk-UA")}
          </div>
        </div>

        {profile.friendshipStatus !== undefined &&
          profile.friendshipStatus !== "blocked_by_viewer" &&
          profile.friendshipStatus !== "blocked_by_other" && (
            <Button
              variant="secondary"
              className="mt-6 w-full"
              disabled={isStartingChat}
              onClick={startChat}
            >
              Написати повідомлення
            </Button>
          )}

        {profile.friendshipStatus === "none" && (
          <Button
            className="mt-6 w-full"
            disabled={isActing}
            onClick={sendRequest}
          >
            Додати в друзі
          </Button>
        )}

        {profile.friendshipStatus === "pending_sent" && (
          <Button
            variant="secondary"
            className="mt-6 w-full"
            disabled={isActing}
            onClick={() => removeRelationship("Запит скасовано")}
          >
            Скасувати запит
          </Button>
        )}

        {profile.friendshipStatus === "pending_received" && (
          <div className="mt-6 flex gap-3">
            <Button
              className="flex-1"
              disabled={isActing}
              onClick={() => respondToRequest("accept")}
            >
              Прийняти
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              disabled={isActing}
              onClick={() => respondToRequest("reject")}
            >
              Відхилити
            </Button>
          </div>
        )}

        {profile.friendshipStatus === "accepted" && (
          <Button
            variant="secondary"
            className="mt-6 w-full"
            disabled={isActing}
            onClick={() => removeRelationship("Видалено з друзів")}
          >
            Видалити з друзів
          </Button>
        )}

        {profile.friendshipStatus === "blocked_by_viewer" && (
          <Button
            variant="secondary"
            className="mt-6 w-full"
            disabled={isActing}
            onClick={() => removeRelationship("Розблоковано")}
          >
            Розблокувати
          </Button>
        )}
      </Card>
    </div>
  );
}
