"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { useSession } from "@/lib/auth/session-context";
import { useToast } from "@/components/ui/toast";

const ERROR_MESSAGES: Record<string, string> = {
  validation_error: "Перевірте правильність введених даних.",
  invalid_token: "Сесія недійсна. Увійдіть знову.",
};

const DELETE_ERROR_MESSAGES: Record<string, string> = {
  invalid_token: "Сесія недійсна. Увійдіть знову.",
  validation_error: "Введіть пароль.",
  invalid_credentials: "Невірний пароль.",
};

// Дзеркалить ліміти app/api/users/me/avatar/route.ts — щоб не ганяти явно
// негодящий файл на сервер.
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

const AVATAR_ERROR_MESSAGES: Record<string, string> = {
  unsupported_file_type: "Підтримуються лише PNG, JPEG, WEBP.",
  file_too_large: "Файл завеликий (максимум 5MB).",
  upload_failed: "Не вдалося завантажити файл. Спробуйте ще раз.",
  invalid_token: "Сесія недійсна. Увійдіть знову.",
};

// Порожнє поле означає "очистити" — бекенд очікує явний null, не порожній рядок.
function toNullableValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export default function EditProfilePage() {
  const { user, accessToken, isLoading, updateUser, logout } = useSession();
  const { toast } = useToast();
  const router = useRouter();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [location, setLocation] = useState(user?.location ?? "");

  const [displayNameError, setDisplayNameError] = useState<
    string | undefined
  >();
  const [bioError, setBioError] = useState<string | undefined>();
  const [locationError, setLocationError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | undefined>();
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [isDeleting, setIsDeleting] = useState(false);

  const [isExporting, setIsExporting] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center">
          <CardTitle>Завантажуємо...</CardTitle>
        </Card>
      </div>
    );
  }

  if (!user || !accessToken) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center">
          <CardTitle>Потрібен вхід</CardTitle>
          <CardDescription className="mb-6">
            Щоб редагувати профіль, спершу увійдіть.
          </CardDescription>
          <Link href="/login">
            <Button className="w-full">Увійти</Button>
          </Link>
        </Card>
      </div>
    );
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setAvatarError(undefined);

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setAvatarError("Підтримуються лише PNG, JPEG, WEBP.");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setAvatarError("Файл завеликий (максимум 5MB).");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setAvatarPreview(objectUrl);
    setIsUploadingAvatar(true);

    try {
      const formData = new FormData();
      formData.set("avatar", file);
      const response = await fetch("/api/users/me/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        const code = data?.error?.code as string | undefined;
        setAvatarError(
          (code && AVATAR_ERROR_MESSAGES[code]) ??
            "Щось пішло не так. Спробуйте ще раз.",
        );
        return;
      }

      updateUser(data.user);
      toast({ title: "Аватар оновлено", variant: "success" });
    } catch {
      setAvatarError("Немає з'єднання із сервером. Спробуйте ще раз.");
    } finally {
      setIsUploadingAvatar(false);
      setAvatarPreview(null);
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);

    let hasError = false;
    const trimmedDisplayName = displayName.trim();
    if (trimmedDisplayName.length > 100) {
      setDisplayNameError("Максимум 100 символів.");
      hasError = true;
    } else {
      setDisplayNameError(undefined);
    }
    if (bio.trim().length > 500) {
      setBioError("Максимум 500 символів.");
      hasError = true;
    } else {
      setBioError(undefined);
    }
    if (location.trim().length > 100) {
      setLocationError("Максимум 100 символів.");
      hasError = true;
    } else {
      setLocationError(undefined);
    }
    if (hasError) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/users/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          displayName: toNullableValue(displayName),
          bio: toNullableValue(bio),
          location: toNullableValue(location),
        }),
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

      updateUser(data.user);
      toast({ title: "Профіль оновлено", variant: "success" });
      router.push("/profile");
    } catch {
      setFormError("Немає з'єднання із сервером. Спробуйте ще раз.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleExportData() {
    setIsExporting(true);
    try {
      const response = await fetch("/api/users/me/export", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        toast({ title: "Не вдалося завантажити дані", variant: "danger" });
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "iskra-data-export.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Немає з'єднання із сервером", variant: "danger" });
    } finally {
      setIsExporting(false);
    }
  }

  async function handleDeleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeleteError(undefined);
    setIsDeleting(true);

    try {
      const response = await fetch("/api/users/me", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await response.json();

      if (!response.ok) {
        const code = data?.error?.code as string | undefined;
        setDeleteError(
          (code && DELETE_ERROR_MESSAGES[code]) ??
            "Щось пішло не так. Спробуйте ще раз.",
        );
        return;
      }

      await logout();
      router.push("/");
    } catch {
      setDeleteError("Немає з'єднання із сервером. Спробуйте ще раз.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <div className="relative mb-4 w-fit">
          <Avatar
            src={avatarPreview ?? user.avatarUrl}
            alt={user.displayName ?? user.username}
            size={80}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingAvatar}
            aria-label="Змінити фото"
            className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Camera className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleAvatarChange}
            className="hidden"
          />
        </div>
        {isUploadingAvatar && (
          <p className="mb-2 text-sm text-foreground/60">
            Завантажуємо фото...
          </p>
        )}
        {avatarError && (
          <p className="mb-2 text-sm text-danger">{avatarError}</p>
        )}

        <CardTitle>Редагувати профіль</CardTitle>
        <CardDescription className="mb-6">@{user.username}</CardDescription>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          noValidate
        >
          <Input
            label="Ім'я"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            error={displayNameError}
            maxLength={100}
          />
          <Textarea
            label="Про себе"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            error={bioError}
            maxLength={500}
          />
          <Input
            label="Локація"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            error={locationError}
            maxLength={100}
          />
          {formError && <p className="text-sm text-danger">{formError}</p>}
          <div className="flex gap-3">
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? "Зберігаємо..." : "Зберегти"}
            </Button>
            <Link href="/profile" className="flex-1">
              <Button type="button" variant="secondary" className="w-full">
                Скасувати
              </Button>
            </Link>
          </div>
        </form>
      </Card>

      <Card className="mt-4 w-full max-w-sm">
        <CardTitle>Мої дані</CardTitle>
        <CardDescription className="mb-4">
          Завантажте копію даних, які Iskra зберігає про вас.
        </CardDescription>
        <Button
          variant="secondary"
          className="w-full"
          onClick={handleExportData}
          disabled={isExporting}
        >
          {isExporting ? "Готуємо файл..." : "Завантажити мої дані"}
        </Button>
      </Card>

      <Card className="mt-4 w-full max-w-sm border border-danger/30">
        <CardTitle className="text-danger">Небезпечна зона</CardTitle>
        <CardDescription className="mb-4">
          Видалення акаунта деактивує його одразу і завершує всі активні сесії.
          Відновлення — лише через звернення в підтримку.
        </CardDescription>
        <Dialog
          onOpenChange={(open) => {
            if (!open) {
              setDeletePassword("");
              setDeleteError(undefined);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button variant="danger" className="w-full">
              Видалити акаунт
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Видалити акаунт?</DialogTitle>
            <DialogDescription className="mb-4">
              Введіть пароль, щоб підтвердити. Цю дію не можна скасувати
              самостійно.
            </DialogDescription>
            <form
              onSubmit={handleDeleteAccount}
              className="flex flex-col gap-4"
              noValidate
            >
              <Input
                label="Пароль"
                type="password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                error={deleteError}
                autoComplete="current-password"
              />
              <div className="flex gap-3">
                <Button
                  type="submit"
                  variant="danger"
                  disabled={isDeleting}
                  className="flex-1"
                >
                  {isDeleting ? "Видаляємо..." : "Так, видалити назавжди"}
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
      </Card>
    </div>
  );
}
