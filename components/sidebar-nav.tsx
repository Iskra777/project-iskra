"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth/session-context";
import { NAV_ITEMS } from "@/lib/nav-items";

export function SidebarNav() {
  const { user, isLoading } = useSession();
  const pathname = usePathname();

  if (isLoading || !user) return null;

  return (
    <nav
      aria-label="Основна навігація"
      className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-foreground/10 bg-card px-3 py-4 lg:flex"
    >
      <div className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon, match }) => {
          const isActive = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-[12px] border border-transparent px-3 py-2.5 text-sm text-foreground/60 transition-all duration-200 hover:text-foreground",
                isActive &&
                  "border-primary/40 bg-primary/10 text-primary shadow-lg shadow-primary/50",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.25 : 1.75} />
              {label}
            </Link>
          );
        })}
      </div>

      <Link
        href="/profile"
        className="mt-auto flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition-colors duration-200 hover:bg-background"
      >
        <Avatar
          src={user.avatarUrl}
          alt={user.displayName ?? user.username}
          size={32}
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {user.displayName ?? user.username}
          </div>
          <div className="truncate text-xs text-foreground/50">
            @{user.username}
          </div>
        </div>
      </Link>
    </nav>
  );
}
