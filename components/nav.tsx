"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth/session-context";

export function Nav() {
  const { user, isLoading, logout } = useSession();

  return (
    <header className="sticky top-0 z-40 border-b border-foreground/10 bg-card">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-2 px-6">
        <Link href="/" className="shrink-0 text-lg font-bold text-primary">
          Iskra
        </Link>

        {!isLoading && user && (
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
            <Link href="/profile" className="shrink-0">
              <Button variant="ghost" size="sm">
                Профіль
              </Button>
            </Link>
            <Link href="/friends" className="shrink-0">
              <Button variant="ghost" size="sm">
                Друзі
              </Button>
            </Link>
            <Link href="/messages" className="shrink-0">
              <Button variant="ghost" size="sm">
                Повідомлення
              </Button>
            </Link>
            <Link href="/search" className="shrink-0">
              <Button variant="ghost" size="sm">
                Пошук
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => logout()}
            >
              Вийти
            </Button>
          </nav>
        )}

        {!isLoading && !user && (
          <nav className="flex items-center gap-1">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Увійти
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Реєстрація</Button>
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
