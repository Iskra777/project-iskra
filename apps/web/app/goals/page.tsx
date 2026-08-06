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

type GoalStatus = "active" | "completed" | "abandoned";

interface Goal {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  status: GoalStatus;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

type Status = "loading" | "success" | "error";

/** Ціль у формі — або нова (створення), або наявна (редагування). */
type FormTarget = "new" | Goal;

interface ProgressRecord {
  id: string;
  value: number | null;
  note: string | null;
  recordedAt: string;
}

interface NewAchievement {
  code: string;
  title: string;
  description: string | null;
}

const STATUS_LABEL: Record<GoalStatus, string> = {
  active: "Активна",
  completed: "Виконано",
  abandoned: "Покинуто",
};

const STATUS_CLASS: Record<GoalStatus, string> = {
  active: "text-primary",
  completed: "text-success",
  abandoned: "text-foreground/40",
};

const STATUS_OPTIONS: GoalStatus[] = ["active", "completed", "abandoned"];

function formatDeadline(deadline: string) {
  return new Date(deadline).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function toNullableValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function formatRecordedAt(recordedAt: string) {
  return new Date(recordedAt).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Власний SVG-графік (без сторонньої бібліотеки) — лінія значень у часі,
 * масштабована під фактичний діапазон (value — довільна метрика, не завжди
 * відсоток 0-100). */
function ProgressSparkline({
  points,
}: {
  points: { value: number; recordedAt: string }[];
}) {
  if (points.length < 2) {
    return (
      <p className="text-sm text-foreground/60">
        Недостатньо даних для графіка — потрібно щонайменше дві відмітки зі
        значенням.
      </p>
    );
  }

  const width = 280;
  const height = 64;
  const padding = 8;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const xStep = (width - padding * 2) / (points.length - 1);

  const coords = points.map((point, index) => {
    const x = padding + index * xStep;
    const y =
      padding + (height - padding * 2) * (1 - (point.value - min) / range);
    return { x, y };
  });

  const polylinePoints = coords.map(({ x, y }) => `${x},${y}`).join(" ");

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Графік значень прогресу в часі"
      >
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="2"
        />
        {coords.map(({ x, y }, index) => (
          <circle
            key={index}
            cx={x}
            cy={y}
            r="2.5"
            fill="var(--color-primary)"
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-foreground/60">
        <span>мін: {min}</span>
        <span>макс: {max}</span>
      </div>
    </div>
  );
}

export default function GoalsPage() {
  const { user, accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();

  const [status, setStatus] = useState<Status>("loading");
  const [goals, setGoals] = useState<Goal[]>([]);

  const [goalToDelete, setGoalToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDeadline, setFormDeadline] = useState("");
  const [formStatus, setFormStatus] = useState<GoalStatus>("active");
  const [formTitleError, setFormTitleError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [goalForProgress, setGoalForProgress] = useState<Goal | null>(null);
  const [progressValue, setProgressValue] = useState("");
  const [progressNote, setProgressNote] = useState("");
  const [progressError, setProgressError] = useState<string | undefined>();
  const [isSubmittingProgress, setIsSubmittingProgress] = useState(false);

  const [goalForHistory, setGoalForHistory] = useState<Goal | null>(null);
  const [progressHistory, setProgressHistory] = useState<ProgressRecord[]>([]);
  const [historyStatus, setHistoryStatus] = useState<Status>("loading");

  /** Стримано (Principle 2) — той самий toast, що й для звичайних дій, без
   * окремого святкового UI. Показується поряд зі звичайним success-toast,
   * не замість нього. */
  function notifyNewAchievements(newAchievements: NewAchievement[]) {
    for (const achievement of newAchievements) {
      toast({
        title: `Нове досягнення: ${achievement.title}`,
        description: achievement.description ?? undefined,
        variant: "success",
      });
    }
  }

  const loadGoals = useCallback(() => {
    if (!accessToken) return;
    return fetch("/api/goals", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          setStatus("error");
          return;
        }
        const data = await response.json();
        setGoals(data.goals);
        setStatus("success");
      })
      .catch(() => {
        setStatus("error");
      });
  }, [accessToken]);

  useEffect(() => {
    if (isSessionLoading || !user) return;
    loadGoals();
  }, [isSessionLoading, user, loadGoals]);

  function openCreateForm() {
    setFormTitle("");
    setFormDescription("");
    setFormDeadline("");
    setFormStatus("active");
    setFormTitleError(undefined);
    setFormError(undefined);
    setFormTarget("new");
  }

  function openEditForm(goal: Goal) {
    setFormTitle(goal.title);
    setFormDescription(goal.description ?? "");
    setFormDeadline(goal.deadline ? goal.deadline.slice(0, 10) : "");
    setFormStatus(goal.status);
    setFormTitleError(undefined);
    setFormError(undefined);
    setFormTarget(goal);
  }

  async function handleSubmitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !formTarget) return;

    const trimmedTitle = formTitle.trim();
    if (trimmedTitle.length === 0 || trimmedTitle.length > 200) {
      setFormTitleError(
        trimmedTitle.length === 0
          ? "Назва не може бути порожньою."
          : "Максимум 200 символів.",
      );
      return;
    }
    setFormTitleError(undefined);
    setFormError(undefined);

    const isCreate = formTarget === "new";
    const payload = {
      title: trimmedTitle,
      description: toNullableValue(formDescription),
      deadline: formDeadline === "" ? null : formDeadline,
      ...(isCreate ? {} : { status: formStatus }),
    };

    setIsSubmitting(true);
    try {
      const response = await fetch(
        isCreate ? "/api/goals" : `/api/goals/${formTarget.id}`,
        {
          method: isCreate ? "POST" : "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        setFormError("Щось пішло не так. Спробуйте ще раз.");
        return;
      }

      if (isCreate) {
        setGoals((prev) => [data.goal, ...prev]);
        toast({ title: "Ціль створено", variant: "success" });
      } else {
        setGoals((prev) =>
          prev.map((goal) => (goal.id === data.goal.id ? data.goal : goal)),
        );
        toast({ title: "Ціль оновлено", variant: "success" });
      }
      notifyNewAchievements(data.newAchievements ?? []);
      setFormTarget(null);
    } catch {
      setFormError("Немає з'єднання із сервером. Спробуйте ще раз.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function openProgressForm(goal: Goal) {
    setProgressValue("");
    setProgressNote("");
    setProgressError(undefined);
    setGoalForProgress(goal);
  }

  async function handleSubmitProgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !goalForProgress) return;

    const trimmedValue = progressValue.trim();
    const parsedValue = trimmedValue === "" ? null : Number(trimmedValue);
    if (parsedValue !== null && !Number.isInteger(parsedValue)) {
      setProgressError("Значення має бути цілим числом.");
      return;
    }
    setProgressError(undefined);

    setIsSubmittingProgress(true);
    try {
      const response = await fetch(
        `/api/goals/${goalForProgress.id}/progress`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            value: parsedValue,
            note: toNullableValue(progressNote),
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        setProgressError("Щось пішло не так. Спробуйте ще раз.");
        return;
      }

      toast({ title: "Прогрес відмічено", variant: "success" });
      notifyNewAchievements(data.newAchievements ?? []);
      setGoalForProgress(null);
    } catch {
      setProgressError("Немає з'єднання із сервером. Спробуйте ще раз.");
    } finally {
      setIsSubmittingProgress(false);
    }
  }

  async function openHistoryView(goal: Goal) {
    setGoalForHistory(goal);
    setHistoryStatus("loading");
    if (!accessToken) return;
    try {
      const response = await fetch(`/api/goals/${goal.id}/progress`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        setHistoryStatus("error");
        return;
      }
      const data = await response.json();
      setProgressHistory(data.progress);
      setHistoryStatus("success");
    } catch {
      setHistoryStatus("error");
    }
  }

  async function confirmDelete() {
    if (!goalToDelete || !accessToken) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/goals/${goalToDelete}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        toast({ title: "Не вдалося видалити ціль", variant: "danger" });
        return;
      }
      setGoals((prev) => prev.filter((goal) => goal.id !== goalToDelete));
      toast({ title: "Ціль видалено", variant: "success" });
      setGoalToDelete(null);
    } finally {
      setIsDeleting(false);
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
            Щоб переглянути цілі, спершу увійдіть.
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
            <CardTitle>Цілі</CardTitle>
            <CardDescription className="mb-6">
              Твої особисті цілі — бачиш лише ти.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreateForm}>
            Створити ціль
          </Button>
        </div>

        {status === "loading" && (
          <p className="py-6 text-center text-sm text-foreground/60">
            Завантажуємо...
          </p>
        )}

        {status === "error" && (
          <p className="py-6 text-center text-sm text-danger">
            Не вдалося завантажити цілі. Спробуйте ще раз.
          </p>
        )}

        {status === "success" && goals.length === 0 && (
          <p className="py-6 text-center text-sm text-foreground/60">
            Ще немає цілей.
          </p>
        )}

        <div className="flex flex-col">
          {status === "success" &&
            goals.map((goal) => (
              <div
                key={goal.id}
                className="border-t border-foreground/10 py-4 first:border-t-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{goal.title}</p>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        STATUS_CLASS[goal.status],
                      )}
                    >
                      {STATUS_LABEL[goal.status]}
                    </span>
                    {goal.deadline && (
                      <span className="ml-2 text-xs text-foreground/60">
                        до {formatDeadline(goal.deadline)}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openHistoryView(goal)}
                    >
                      Прогрес
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openProgressForm(goal)}
                    >
                      Відмітити прогрес
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditForm(goal)}
                    >
                      Редагувати
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setGoalToDelete(goal.id)}
                    >
                      Видалити
                    </Button>
                  </div>
                </div>

                {goal.description && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">
                    {goal.description}
                  </p>
                )}
              </div>
            ))}
        </div>
      </Card>

      <Dialog
        open={formTarget !== null}
        onOpenChange={(open) => !open && setFormTarget(null)}
      >
        <DialogContent>
          <DialogTitle>
            {formTarget === "new" ? "Створити ціль" : "Редагувати ціль"}
          </DialogTitle>
          <DialogDescription className="mb-4">Бачиш лише ти.</DialogDescription>
          <form
            onSubmit={handleSubmitForm}
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
            <Input
              label="Дедлайн"
              type="date"
              value={formDeadline}
              onChange={(event) => setFormDeadline(event.target.value)}
            />
            {formTarget !== "new" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Статус</label>
                <select
                  value={formStatus}
                  onChange={(event) =>
                    setFormStatus(event.target.value as GoalStatus)
                  }
                  className="h-10 rounded-card border border-foreground/15 bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {STATUS_LABEL[option]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {formError && <p className="text-sm text-danger">{formError}</p>}
            <div className="flex gap-3">
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? "Зберігаємо..." : "Зберегти"}
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

      <Dialog
        open={goalForProgress !== null}
        onOpenChange={(open) => !open && setGoalForProgress(null)}
      >
        <DialogContent>
          <DialogTitle>Відмітити прогрес</DialogTitle>
          <DialogDescription className="mb-4">
            {goalForProgress?.title}
          </DialogDescription>
          <form
            onSubmit={handleSubmitProgress}
            className="flex flex-col gap-4"
            noValidate
          >
            <Input
              label="Значення"
              type="number"
              value={progressValue}
              onChange={(event) => setProgressValue(event.target.value)}
              error={progressError}
              placeholder="напр. відсоток виконання"
            />
            <Textarea
              label="Нотатка"
              value={progressNote}
              onChange={(event) => setProgressNote(event.target.value)}
              maxLength={2000}
            />
            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={isSubmittingProgress}
                className="flex-1"
              >
                {isSubmittingProgress ? "Зберігаємо..." : "Зберегти"}
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

      <Dialog
        open={goalForHistory !== null}
        onOpenChange={(open) => !open && setGoalForHistory(null)}
      >
        <DialogContent>
          <DialogTitle>Прогрес</DialogTitle>
          <DialogDescription className="mb-4">
            {goalForHistory?.title}
          </DialogDescription>

          {historyStatus === "loading" && (
            <p className="py-4 text-center text-sm text-foreground/60">
              Завантажуємо...
            </p>
          )}

          {historyStatus === "error" && (
            <p className="py-4 text-center text-sm text-danger">
              Не вдалося завантажити прогрес. Спробуйте ще раз.
            </p>
          )}

          {historyStatus === "success" && progressHistory.length === 0 && (
            <p className="py-4 text-center text-sm text-foreground/60">
              Ще немає відміток прогресу.
            </p>
          )}

          {historyStatus === "success" && progressHistory.length > 0 && (
            <>
              <ProgressSparkline
                points={progressHistory
                  .filter(
                    (record): record is ProgressRecord & { value: number } =>
                      record.value !== null,
                  )
                  .map((record) => ({
                    value: record.value,
                    recordedAt: record.recordedAt,
                  }))
                  .reverse()}
              />

              <div className="mt-4 flex max-h-64 flex-col gap-2 overflow-y-auto">
                {progressHistory.map((record) => (
                  <div
                    key={record.id}
                    className="border-t border-foreground/10 pt-2 first:border-t-0 first:pt-0"
                  >
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{record.value ?? "—"}</span>
                      <span className="text-xs text-foreground/60">
                        {formatRecordedAt(record.recordedAt)}
                      </span>
                    </div>
                    {record.note && (
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground/80">
                        {record.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <DialogClose asChild>
            <Button type="button" variant="secondary" className="mt-4 w-full">
              Закрити
            </Button>
          </DialogClose>
        </DialogContent>
      </Dialog>

      <Dialog
        open={goalToDelete !== null}
        onOpenChange={(open) => !open && setGoalToDelete(null)}
      >
        <DialogContent>
          <DialogTitle>Видалити ціль?</DialogTitle>
          <DialogDescription className="mb-4">
            Цю дію не можна скасувати.
          </DialogDescription>
          <div className="flex gap-3">
            <Button
              variant="danger"
              className="flex-1"
              disabled={isDeleting}
              onClick={confirmDelete}
            >
              {isDeleting ? "Видаляємо..." : "Видалити"}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="secondary" className="flex-1">
                Скасувати
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
