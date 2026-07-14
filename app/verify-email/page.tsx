"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { Card, CardTitle, CardDescription } from "@/components/ui/card";

type Status = "loading" | "success" | "error";

// Один в один з кодами помилок API.md → POST /api/auth/verify-email.
const ERROR_MESSAGES: Record<string, string> = {
  validation_error: "Посилання неповне.",
  invalid_token: "Посилання недійсне або протерміноване.",
};

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>(token ? "loading" : "error");
  const [message, setMessage] = useState<string | undefined>(
    token ? undefined : ERROR_MESSAGES.validation_error,
  );

  useEffect(() => {
    if (!token) return;

    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json();
          const code = data?.error?.code as string | undefined;
          setMessage((code && ERROR_MESSAGES[code]) ?? "Щось пішло не так.");
          setStatus("error");
          return;
        }
        setStatus("success");
      })
      .catch(() => {
        setMessage("Немає з'єднання із сервером.");
        setStatus("error");
      });
  }, [token]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <Card className="w-full max-w-sm text-center">
        {status === "loading" && (
          <>
            <CardTitle>Перевіряємо...</CardTitle>
            <CardDescription>Зачекайте, будь ласка.</CardDescription>
          </>
        )}
        {status === "success" && (
          <>
            <CardTitle>Email підтверджено</CardTitle>
            <CardDescription>
              Тепер можна{" "}
              <Link href="/login" className="text-primary underline">
                увійти
              </Link>
              .
            </CardDescription>
          </>
        )}
        {status === "error" && (
          <>
            <CardTitle>Не вдалося підтвердити</CardTitle>
            <CardDescription>{message}</CardDescription>
          </>
        )}
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
