"use client";

import { Bookmark } from "lucide-react";

import { cn } from "@/lib/utils";

export interface BookmarkButtonProps {
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function BookmarkButton({
  active,
  onToggle,
  disabled,
}: BookmarkButtonProps) {
  const label = active ? "Прибрати із закладок" : "Зберегти";

  return (
    <button
      type="button"
      title={label}
      aria-pressed={active}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full text-sm transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
        active ? "bg-primary/20 ring-1 ring-primary/50" : "hover:bg-background",
      )}
    >
      <Bookmark
        className={cn("h-4 w-4", active && "fill-primary text-primary")}
      />
    </button>
  );
}
