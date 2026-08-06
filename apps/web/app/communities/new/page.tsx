"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/auth/session-context";
import { useToast } from "@/components/ui/toast";

const NAME_MAX = 50;
const DESCRIPTION_MAX = 1000;

export default function NewCommunityPage() {
  const router = useRouter();
  const { user, accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [isCreating, setIsCreating] = useState(false);

  const canSubmit = name.trim().length >= 3 && !isCreating;

  async function handleCreate() {
    if (!canSubmit || !accessToken) return;

    setIsCreating(true);
    try {
      const response = await fetch("/api/communities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          visibility,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        toast({
          title:
            body.error?.code === "name_taken"
              ? "Спільнота з такою назвою вже існує"
              : "Не вдалося створити спільноту",
          variant: "danger",
        });
        return;
      }
      router.push(`/communities/${body.community.id}`);
    } catch {
      toast({ title: "Немає з'єднання із сервером", variant: "danger" });
    } finally {
      setIsCreating(false);
    }
  }

  if (isSessionLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-foreground/60">Завантажуємо...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center md:max-w-md lg:max-w-lg xl:max-w-xl">
          <CardTitle>Потрібен вхід</CardTitle>
          <CardDescription className="mb-6">
            Щоб створити спільноту, спершу увійдіть.
          </CardDescription>
          <Link href="/login">
            <Button className="w-full">Увійти</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <Card className="w-full max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
        <CardTitle>Нова спільнота</CardTitle>
        <CardDescription className="mb-6">
          Назва, опис і чи потрібне схвалення для вступу.
        </CardDescription>

        <div className="flex flex-col gap-4">
          <Input
            label="Назва"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Наприклад, Любителі гір"
            maxLength={NAME_MAX}
          />
          <Textarea
            label="Опис (необов'язково)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Про що ця спільнота?"
            maxLength={DESCRIPTION_MAX}
          />
          <div>
            <div className="mb-1.5 text-sm font-medium">Видимість</div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={visibility === "public" ? "primary" : "secondary"}
                className="flex-1"
                onClick={() => setVisibility("public")}
              >
                Публічна
              </Button>
              <Button
                type="button"
                variant={visibility === "private" ? "primary" : "secondary"}
                className="flex-1"
                onClick={() => setVisibility("private")}
              >
                Приватна
              </Button>
            </div>
            <p className="mt-1.5 text-sm text-foreground/60">
              {visibility === "public"
                ? "Будь-хто може вступити одразу."
                : "Вступ — лише після схвалення адміном або модератором."}
            </p>
          </div>
        </div>

        <Button
          className="mt-6 w-full"
          disabled={!canSubmit}
          onClick={handleCreate}
        >
          {isCreating ? "Створюємо..." : "Створити спільноту"}
        </Button>
      </Card>
    </div>
  );
}
