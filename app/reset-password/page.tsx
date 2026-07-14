"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";

// Один в один з кодами помилок API.md → POST /api/auth/reset-password.
const ERROR_MESSAGES: Record<string, string> = {
  validation_error: "Посилання неповне.",
  weak_password: "Пароль має містити від 8 до 128 символів.",
  invalid_token: "Посилання недійсне або протерміноване.",
};

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>(
    token ? undefined : ERROR_MESSAGES.validation_error,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    setFormError(undefined);
    if (password.length < 8 || password.length > 128) {
      setPasswordError("Мінімум 8 символів.");
      return;
    }
    setPasswordError(undefined);

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        const code = data?.error?.code as string | undefined;
        setFormError(
          (code && ERROR_MESSAGES[code]) ??
            "Щось пішло не так. Спробуйте ще раз.",
        );
        return;
      }

      setSuccess(true);
    } catch {
      setFormError("Немає з'єднання із сервером. Спробуйте ще раз.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (success) {
    return (
      <Card className="w-full max-w-sm text-center">
        <CardTitle>Пароль змінено</CardTitle>
        <CardDescription>
          Тепер можна{" "}
          <Link href="/login" className="text-primary underline">
            увійти
          </Link>{" "}
          з новим паролем. Усі попередні сесії завершено.
        </CardDescription>
      </Card>
    );
  }

  if (!token) {
    return (
      <Card className="w-full max-w-sm text-center">
        <CardTitle>Не вдалося відкрити форму</CardTitle>
        <CardDescription>{formError}</CardDescription>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardTitle>Новий пароль</CardTitle>
      <CardDescription className="mb-6">
        Введіть новий пароль для акаунта.
      </CardDescription>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Новий пароль"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={passwordError}
          autoComplete="new-password"
        />
        {formError && <p className="text-sm text-danger">{formError}</p>}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Зберігаємо..." : "Змінити пароль"}
        </Button>
      </form>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <Suspense fallback={null}>
        <ResetPasswordContent />
      </Suspense>
    </div>
  );
}
