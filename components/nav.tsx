"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth/session-context";

export function Nav() {
  const { user, isLoading, logout } = useSession();

  return (
    <header className="sticky top-0 z-40 border-b border-foreground/10 bg-card">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
        <Link href="/" className="text-lg font-bold text-primary">
          Iskra
        </Link>

        {!isLoading && user && (
          <nav className="flex items-center gap-1">
            <Link href="/profile">
              <Button variant="ghost" size="sm">
                Профіль
              </Button>
            </Link>
            <Link href="/friends">
              <Button variant="ghost" size="sm">
                Друзі
              </Button>
            </Link>
            <Link href="/search">
              <Button variant="ghost" size="sm">
                Пошук
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={() => logout()}>
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
