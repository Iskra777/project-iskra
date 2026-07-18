"use client";

import Link from "next/link";

import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useSession } from "@/lib/auth/session-context";

export default function ProfilePage() {
  const { user, isLoading, logout } = useSession();

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

        <div className="mt-6 flex gap-3">
          <Link href="/profile/edit" className="flex-1">
            <Button variant="secondary" className="w-full">
              Редагувати профіль
            </Button>
          </Link>
          <Link href="/bookmarks" className="flex-1">
            <Button variant="secondary" className="w-full">
              Мої закладки
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
    </div>
  );
}
