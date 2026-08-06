import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({
  className,
  label,
  error,
  id,
  ...props
}: TextareaProps) {
  const generatedId = React.useId();
  const textareaId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={textareaId} className="text-sm font-medium">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={cn(
          "min-h-24 rounded-card border border-foreground/15 bg-card px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50",
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
