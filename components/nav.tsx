"use client";

import Link from "next/link";
import { LogOut, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth/session-context";

export function Nav() {
  const { user, isLoading, logout } = useSession();

  return (
    <header className="sticky top-0 z-40 border-b border-foreground/10 bg-card">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-2 px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-1.5 text-lg font-bold text-foreground"
        >
          Iskra
          <Zap className="h-4 w-4 fill-accent text-accent" />
        </Link>

        {!isLoading && user && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout()}
            aria-label="Вийти"
          >
            <LogOut className="h-4 w-4" />
          </Button>
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
