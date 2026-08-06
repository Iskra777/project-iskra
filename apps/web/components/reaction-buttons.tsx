"use client";

import { cn } from "@/lib/utils";

export type ReactionType = "fire" | "bulb" | "clap";

const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: "fire", emoji: "🔥", label: "Надихнуло" },
  { type: "bulb", emoji: "💡", label: "Корисно" },
  { type: "clap", emoji: "🙌", label: "Підтримую" },
];

export interface ReactionButtonsProps {
  activeTypes: ReactionType[];
  onToggle: (type: ReactionType) => void;
  disabled?: boolean;
}

/** Лише перемикачі "я відреагував" — без лічильника (PRINCIPLES.md,
 * принцип 7: "Не лайки. Не перегляди."). */
export function ReactionButtons({
  activeTypes,
  onToggle,
  disabled,
}: ReactionButtonsProps) {
  return (
    <div className="flex gap-1">
      {REACTIONS.map(({ type, emoji, label }) => {
        const isActive = activeTypes.includes(type);
        return (
          <button
            key={type}
            type="button"
            title={label}
            aria-pressed={isActive}
            aria-label={label}
            disabled={disabled}
            onClick={() => onToggle(type)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-sm transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
              isActive
                ? "bg-primary/20 ring-1 ring-primary/50"
                : "hover:bg-background",
            )}
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );
}
