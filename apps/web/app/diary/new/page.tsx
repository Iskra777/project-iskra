"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { useSession } from "@/lib/auth/session-context";
import { useToast } from "@/components/ui/toast";

function toNullableValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export default function NewDiaryEntryPage() {
  const { user, accessToken, isLoading } = useSession();
  const { toast } = useToast();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [contentError, setContentError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center md:max-w-md lg:max-w-lg xl:max-w-xl">
          <CardTitle>Завантажуємо...</CardTitle>
        </Card>
      </div>
    );
  }

  if (!user || !accessToken) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center md:max-w-md lg:max-w-lg xl:max-w-xl">
          <CardTitle>Потрібен вхід</CardTitle>
          <CardDescription className="mb-6">
            Щоб написати запис, спершу увійдіть.
          </CardDescription>
          <Link href="/login">
            <Button className="w-full">Увійти</Button>
          </Link>
        </Card>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedContent = content.trim();
    if (trimmedContent.length === 0) {
      setContentError("Запис не може бути порожнім.");
      return;
    }
    setContentError(undefined);

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/diary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: toNullableValue(title),
          content: trimmedContent,
        }),
      });

      if (!response.ok) {
        toast({ title: "Не вдалося зберегти запис", variant: "danger" });
        return;
      }

      toast({ title: "Запис збережено", variant: "success" });
      router.push("/diary");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <Card className="w-full max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
        <CardTitle>Новий запис</CardTitle>
        <CardDescription className="mb-6">Бачиш лише ти.</CardDescription>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          noValidate
        >
          <Input
            label="Заголовок (опційно)"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
          />
          <Textarea
            label="Запис"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            error={contentError}
            maxLength={20000}
            className="min-h-64"
          />
          <div className="flex gap-3">
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? "Зберігаємо..." : "Зберегти"}
            </Button>
            <Link href="/diary" className="flex-1">
              <Button type="button" variant="secondary" className="w-full">
                Скасувати
              </Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
