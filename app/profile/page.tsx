"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useSession } from "@/lib/auth/session-context";

interface Achievement {
  code: string;
  title: string;
  description: string | null;
  iconUrl: string | null;
  earnedAt: string;
}

function formatEarnedAt(earnedAt: string) {
  return new Date(earnedAt).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function ProfilePage() {
  const { user, accessToken, isLoading, logout } = useSession();

  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [isLoadingAchievements, setIsLoadingAchievements] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    fetch("/api/users/me/achievements", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        setAchievements(data.achievements);
      })
      .finally(() => setIsLoadingAchievements(false));
  }, [accessToken]);

  if (isLoading) {
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
            Щоб переглянути профіль, спершу увійдіть.
          </CardDescription>
          <Link href="/login">
            <Button className="w-full">Увійти</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <Card className="w-full max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl">
        <Avatar
          src={user.avatarUrl}
          alt={user.displayName ?? user.username}
          size={80}
          className="mb-4"
        />
        <CardTitle>{user.displayName ?? user.username}</CardTitle>
        <CardDescription className="mb-6">@{user.username}</CardDescription>

        <div className="flex flex-col gap-3 text-sm">
          <div>
            <span className="text-foreground/60">Email: </span>
            {user.email}
          </div>
          {user.bio && (
            <div>
              <span className="text-foreground/60">Про себе: </span>
              {user.bio}
            </div>
          )}
          {user.location && (
            <div>
              <span className="text-foreground/60">Локація: </span>
              {user.location}
            </div>
          )}
          <div>
            <span className="text-foreground/60">Email підтверджено: </span>
            {user.isEmailVerified ? "так" : "ні"}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/profile/edit"
            className="min-w-[calc(50%-0.375rem)] flex-1"
          >
            <Button variant="secondary" className="w-full">
              Редагувати профіль
            </Button>
          </Link>
          <Link href="/bookmarks" className="min-w-[calc(50%-0.375rem)] flex-1">
            <Button variant="secondary" className="w-full">
              Мої закладки
            </Button>
          </Link>
          <Link href="/goals" className="min-w-[calc(50%-0.375rem)] flex-1">
            <Button variant="secondary" className="w-full">
              Цілі
            </Button>
          </Link>
          <Link href="/diary" className="min-w-[calc(50%-0.375rem)] flex-1">
            <Button variant="secondary" className="w-full">
              Щоденник
            </Button>
          </Link>
        </div>
        <Button
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => logout()}
        >
          Вийти
        </Button>
      </Card>

      <Card className="mt-4 w-full max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl">
        <CardTitle>Досягнення</CardTitle>
        <CardDescription className="mb-6">Бачиш лише ти.</CardDescription>

        {isLoadingAchievements && (
          <p className="py-4 text-center text-sm text-foreground/60">
            Завантажуємо...
          </p>
        )}

        {!isLoadingAchievements && achievements.length === 0 && (
          <p className="py-4 text-center text-sm text-foreground/60">
            Ще немає жодного досягнення.
          </p>
        )}

        {!isLoadingAchievements && achievements.length > 0 && (
          <div className="flex flex-col">
            {achievements.map((achievement) => (
              <div
                key={achievement.code}
                className="border-t border-foreground/10 py-3 first:border-t-0 first:pt-0"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">{achievement.title}</p>
                  <span className="shrink-0 text-xs text-foreground/60">
                    {formatEarnedAt(achievement.earnedAt)}
                  </span>
                </div>
                {achievement.description && (
                  <p className="mt-0.5 text-sm text-foreground/80">
                    {achievement.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
