"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Завжди однаковий успішний стан незалежно від відповіді сервера — той
  // самий anti-enumeration підхід, що й у POST /api/auth/request-password-reset
  // (API.md): UI не повинен розрізняти "email існує" від "не існує".
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!EMAIL_REGEX.test(email)) {
      setEmailError("Введіть коректний email.");
      return;
    }
    setEmailError(undefined);

    setIsSubmitting(true);
    try {
      await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Навмисно ігнорується — успішний стан показується незалежно від
      // результату, включно з мережевою помилкою.
    } finally {
      setIsSubmitting(false);
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center md:max-w-md lg:max-w-lg xl:max-w-xl">
          <CardTitle>Перевірте пошту</CardTitle>
          <CardDescription>
            Якщо акаунт з таким email існує, ми надіслали посилання для скидання
            пароля.
          </CardDescription>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <Card className="w-full max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl">
        <CardTitle>Забули пароль?</CardTitle>
        <CardDescription className="mb-6">
          Введіть email — надішлемо посилання для скидання пароля.
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
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Надсилаємо..." : "Надіслати посилання"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
