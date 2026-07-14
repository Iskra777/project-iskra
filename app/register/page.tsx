"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

// Один в один з кодами помилок API.md → POST /api/auth/register.
const ERROR_MESSAGES: Record<string, string> = {
  validation_error: "Перевірте правильність введених даних.",
  weak_password: "Пароль має містити від 8 до 128 символів.",
  email_taken: "Цей email вже зареєстровано.",
  username_taken: "Цей username вже зайнятий.",
};

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);

  const [emailError, setEmailError] = useState<string | undefined>();
  const [usernameError, setUsernameError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [consentError, setConsentError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

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
    if (
      username.length < 3 ||
      username.length > 20 ||
      !USERNAME_REGEX.test(username)
    ) {
      setUsernameError("3-20 символів: латинські літери, цифри, підкреслення.");
      hasError = true;
    } else {
      setUsernameError(undefined);
    }
    if (password.length < 8 || password.length > 128) {
      setPasswordError("Мінімум 8 символів.");
      hasError = true;
    } else {
      setPasswordError(undefined);
    }
    if (!consent) {
      setConsentError("Потрібна згода, щоб продовжити.");
      hasError = true;
    } else {
      setConsentError(undefined);
    }
    if (hasError) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password, consent }),
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

      setRegistered(true);
    } catch {
      setFormError("Немає з'єднання із сервером. Спробуйте ще раз.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (registered) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center">
          <CardTitle>Перевірте пошту</CardTitle>
          <CardDescription>
            Ми надіслали лист із посиланням для підтвердження на {email}.
          </CardDescription>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardTitle>Реєстрація</CardTitle>
        <CardDescription className="mb-6">
          Створіть акаунт, щоб почати.
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
            label="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            error={usernameError}
            autoComplete="username"
          />
          <Input
            label="Пароль"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={passwordError}
            autoComplete="new-password"
          />
          <Checkbox
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            error={consentError}
            label={
              <>
                Я погоджуюсь з{" "}
                <Link href="/privacy" className="text-primary underline">
                  політикою приватності
                </Link>
              </>
            }
          />
          {formError && <p className="text-sm text-danger">{formError}</p>}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Реєструємо..." : "Зареєструватись"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
