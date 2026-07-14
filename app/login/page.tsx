"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
}

// Один в один з кодами помилок API.md → POST /api/auth/login.
const ERROR_MESSAGES: Record<string, string> = {
  validation_error: "Перевірте правильність email і пароля.",
  invalid_credentials: "Невірний email або пароль.",
  email_not_verified: "Підтвердіть email перед входом.",
  account_deactivated: "Акаунт деактивовано.",
  rate_limited: "Забагато спроб. Спробуйте пізніше.",
};

export default function LoginPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState<LoginUser | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);

    let hasError = false;
    if (!EMAIL_REGEX.test(email)) {
      setEmailError("Введіть коректний email.");
      hasError = true;
    } else {
      setEmailError(undefined);
    }
    if (password.length === 0) {
      setPasswordError("Введіть пароль.");
      hasError = true;
    } else {
      setPasswordError(undefined);
    }
    if (hasError) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
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

      setLoggedInUser(data.user);
      toast({
        title: "Вхід виконано",
        description: `Вітаємо, ${data.user.displayName ?? data.user.username}.`,
        variant: "success",
      });
    } catch {
      setFormError("Немає з'єднання із сервером. Спробуйте ще раз.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loggedInUser) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center">
          <CardTitle>
            Вітаємо, {loggedInUser.displayName ?? loggedInUser.username}
          </CardTitle>
          <CardDescription>Ви увійшли як {loggedInUser.email}.</CardDescription>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardTitle>Вхід</CardTitle>
        <CardDescription className="mb-6">
          Введіть email і пароль, щоб продовжити.
        </CardDescription>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          noValidate
        >
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={emailError}
            autoComplete="email"
          />
          <Input
            label="Пароль"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={passwordError}
            autoComplete="current-password"
          />
          {formError && <p className="text-sm text-danger">{formError}</p>}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Входимо..." : "Увійти"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
