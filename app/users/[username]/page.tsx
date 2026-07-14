"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { useSession } from "@/lib/auth/session-context";

interface PublicProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  location: string | null;
  createdAt: string;
}

type Status = "loading" | "success" | "not_found";

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const { accessToken, isLoading: isSessionLoading } = useSession();

  const [status, setStatus] = useState<Status>("loading");
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  useEffect(() => {
    // Чекаємо завершення відновлення сесії, щоб, якщо це власний профіль,
    // запит одразу пішов із access-токеном — інакше короткочасно показали б
    // публічну версію навіть власнику.
    if (isSessionLoading) return;

    let cancelled = false;

    fetch(`/api/users/${params.username}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setStatus("not_found");
          return;
        }
        const data = await response.json();
        setProfile(data.user);
        setStatus("success");
      })
      .catch(() => {
        if (!cancelled) setStatus("not_found");
      });

    return () => {
      cancelled = true;
    };
  }, [params.username, accessToken, isSessionLoading]);

  if (status === "loading") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center">
          <CardTitle>Завантажуємо...</CardTitle>
        </Card>
      </div>
    );
  }

  if (status === "not_found" || !profile) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center">
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
      <Card className="w-full max-w-sm">
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
      </Card>
    </div>
  );
}
