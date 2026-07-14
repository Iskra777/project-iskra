import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ className, label, error, id, ...props }: InputProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          "h-10 rounded-card border border-foreground/15 bg-card px-3 text-sm text-foreground placeholder:text-foreground/40 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50",
          error && "border-danger focus-visible:ring-danger/50",
          className,
        )}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
