import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  label: React.ReactNode;
  error?: string;
}

export function Checkbox({
  className,
  label,
  error,
  id,
  ...props
}: CheckboxProps) {
  const generatedId = React.useId();
  const checkboxId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-2">
        <div className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          <input
            id={checkboxId}
            type="checkbox"
            className={cn(
              "peer h-5 w-5 shrink-0 appearance-none rounded-[6px] border border-foreground/25 bg-card transition-colors duration-150 checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50",
              error && "border-danger",
              className,
            )}
            aria-invalid={error ? true : undefined}
            {...props}
          />
          <Check className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100" />
        </div>
        <label htmlFor={checkboxId} className="text-sm leading-5">
          {label}
        </label>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
