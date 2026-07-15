"use client";

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

type ToastVariant = "default" | "danger" | "success";

interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastContextValue {
  toast: (item: Omit<ToastItem, "id">) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast має використовуватись всередині ToastProvider");
  }
  return context;
}

const variantClassName: Record<ToastVariant, string> = {
  default: "border-foreground/15 bg-card text-foreground",
  danger: "border-danger/40 bg-card text-danger",
  success: "border-success/40 bg-card text-success",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback((item: Omit<ToastItem, "id">) => {
    // Не crypto.randomUUID() — воно недоступне в "небезпечному контексті"
    // (звичайний HTTP на хості, відмінному від localhost, напр. телефон
    // через LAN IP), а унікальність тут потрібна лише в межах клієнтської
    // сесії для React-ключів, без криптографічних гарантій.
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setItems((prev) => [...prev, { ...item, id }]);
  }, []);

  const remove = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection="right" duration={4000}>
        {children}
        {items.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            className={cn(
              "flex items-start gap-3 rounded-card border p-4 shadow-lg transition-all duration-150 data-[state=closed]:opacity-0 data-[swipe=end]:translate-x-full",
              variantClassName[item.variant ?? "default"],
            )}
            onOpenChange={(open) => {
              if (!open) remove(item.id);
            }}
          >
            <div className="flex-1">
              {item.title && (
                <ToastPrimitive.Title className="text-sm font-medium">
                  {item.title}
                </ToastPrimitive.Title>
              )}
              {item.description && (
                <ToastPrimitive.Description className="text-sm text-foreground/70">
                  {item.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close className="text-foreground/60 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              <X className="h-4 w-4" />
              <span className="sr-only">Закрити</span>
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-50 flex w-full max-w-sm flex-col gap-2 p-6" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
