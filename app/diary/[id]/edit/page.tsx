"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { useSession } from "@/lib/auth/session-context";
import { useToast } from "@/components/ui/toast";

type Status = "loading" | "success" | "not_found" | "error";

function toNullableValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export default function EditDiaryEntryPage() {
  const { id: entryId } = useParams<{ id: string }>();
  const { user, accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();
  const router = useRouter();

  const [status, setStatus] = useState<Status>("loading");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [contentError, setContentError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isSessionLoading || !accessToken) return;
    fetch(`/api/diary/${entryId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (response.status === 404) {
          setStatus("not_found");
          return;
        }
        if (!response.ok) {
          setStatus("error");
          return;
        }
        const data = await response.json();
        setTitle(data.entry.title ?? "");
        setContent(data.entry.content);
        setStatus("success");
      })
      .catch(() => setStatus("error"));
  }, [isSessionLoading, accessToken, entryId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;

    const trimmedContent = content.trim();
    if (trimmedContent.length === 0) {
      setContentError("Запис не може бути порожнім.");
      return;
    }
    setContentError(undefined);

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/diary/${entryId}`, {
        method: "PATCH",
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

      toast({ title: "Запис оновлено", variant: "success" });
      router.push("/diary");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSessionLoading || status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-foreground/60">Завантажуємо...</p>
      </div>
    );
  }

  if (!user || !accessToken) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center md:max-w-md lg:max-w-lg xl:max-w-xl">
          <CardTitle>Потрібен вхід</CardTitle>
          <CardDescription className="mb-6">
            Щоб редагувати запис, спершу увійдіть.
          </CardDescription>
          <Link href="/login">
            <Button className="w-full">Увійти</Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-foreground/60">Запис не знайдено.</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-danger">
          Не вдалося завантажити запис. Спробуйте ще раз.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <Card className="w-full max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
        <CardTitle>Редагувати запис</CardTitle>
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
