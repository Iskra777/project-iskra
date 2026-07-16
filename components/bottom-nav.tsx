"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth/session-context";
import { NAV_ITEMS } from "@/lib/nav-items";

export function BottomNav() {
  const { user, isLoading } = useSession();
  const pathname = usePathname();

  if (isLoading || !user) return null;

  return (
    <nav
      aria-label="Основна навігація"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-sm items-center justify-around rounded-card border border-foreground/10 bg-card/90 px-2 py-2 shadow-lg backdrop-blur-sm md:max-w-md xl:max-w-lg lg:hidden"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon, match }) => {
        const isActive = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 px-1 py-1 text-foreground/50 transition-colors duration-200 hover:text-foreground",
              isActive && "text-primary",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-[12px] border border-transparent transition-all duration-200",
                isActive &&
                  "border-primary/40 bg-primary/10 shadow-lg shadow-primary/50",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.25 : 1.75} />
            </span>
            <span className="text-[11px] leading-none">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
