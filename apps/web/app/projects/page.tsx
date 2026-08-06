"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth/session-context";
import { useToast } from "@/components/ui/toast";

type ProjectStatus = "planning" | "active" | "completed" | "archived";

interface Project {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
}

type Status = "loading" | "success" | "error";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Планування",
  active: "Активний",
  completed: "Завершено",
  archived: "Архів",
};

const STATUS_CLASS: Record<ProjectStatus, string> = {
  planning: "text-foreground/60",
  active: "text-primary",
  completed: "text-success",
  archived: "text-foreground/40",
};

function toNullableValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export default function ProjectsPage() {
  const { user, accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();

  const [status, setStatus] = useState<Status>("loading");
  const [projects, setProjects] = useState<Project[]>([]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTitleError, setFormTitleError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadProjects = useCallback(() => {
    if (!accessToken) return;
    return fetch("/api/projects", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          setStatus("error");
          return;
        }
        const data = await response.json();
        setProjects(data.projects);
        setStatus("success");
      })
      .catch(() => {
        setStatus("error");
      });
  }, [accessToken]);

  useEffect(() => {
    if (isSessionLoading || !user) return;
    loadProjects();
  }, [isSessionLoading, user, loadProjects]);

  function openCreateForm() {
    setFormTitle("");
    setFormDescription("");
    setFormTitleError(undefined);
    setFormError(undefined);
    setIsCreateOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;

    const trimmedTitle = formTitle.trim();
    if (trimmedTitle.length === 0) {
      setFormTitleError("Назва не може бути порожньою.");
      return;
    }
    setFormTitleError(undefined);
    setFormError(undefined);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: trimmedTitle,
          description: toNullableValue(formDescription),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setFormError(
          body?.error?.message ??
            "Не вдалося створити проєкт. Спробуйте ще раз.",
        );
        return;
      }

      setIsCreateOpen(false);
      toast({ title: "Проєкт створено", variant: "success" });
      loadProjects();
    } finally {
      setIsSubmitting(false);
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
            Щоб переглянути проєкти, спершу увійдіть.
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
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>Проєкти</CardTitle>
            <CardDescription className="mb-6">
              Твої спільні проєкти — власні та ті, куди тебе додали.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreateForm}>
            Створити проєкт
          </Button>
        </div>

        {status === "loading" && (
          <p className="py-6 text-center text-sm text-foreground/60">
            Завантажуємо...
          </p>
        )}

        {status === "error" && (
          <p className="py-6 text-center text-sm text-danger">
            Не вдалося завантажити проєкти. Спробуйте ще раз.
          </p>
        )}

        {status === "success" && projects.length === 0 && (
          <p className="py-6 text-center text-sm text-foreground/60">
            Ще немає жодного проєкту.
          </p>
        )}

        <div className="flex flex-col">
          {status === "success" &&
            projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="border-t border-foreground/10 py-4 first:border-t-0 hover:bg-background"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium">
                    {project.title}
                  </p>
                  <span
                    className={cn(
                      "shrink-0 text-xs font-medium",
                      STATUS_CLASS[project.status],
                    )}
                  >
                    {STATUS_LABEL[project.status]}
                  </span>
                </div>
                {project.description && (
                  <p className="mt-1 truncate text-sm text-foreground/60">
                    {project.description}
                  </p>
                )}
              </Link>
            ))}
        </div>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogTitle>Створити проєкт</DialogTitle>
          <DialogDescription className="mb-4">
            Ти станеш адміністратором проєкту.
          </DialogDescription>

          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
            noValidate
          >
            <Input
              label="Назва"
              value={formTitle}
              onChange={(event) => setFormTitle(event.target.value)}
              error={formTitleError}
              maxLength={200}
            />
            <Textarea
              label="Опис"
              value={formDescription}
              onChange={(event) => setFormDescription(event.target.value)}
              maxLength={5000}
            />
            {formError && <p className="text-sm text-danger">{formError}</p>}
            <div className="flex gap-3">
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? "Зберігаємо..." : "Створити"}
              </Button>
              <DialogClose asChild>
                <Button type="button" variant="secondary" className="flex-1">
                  Скасувати
                </Button>
              </DialogClose>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
