"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/auth/session-context";
import { useToast } from "@/components/ui/toast";

interface RoomHost {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface RoomDetail {
  id: string;
  hostId: string;
  title: string;
  description: string | null;
  host: RoomHost;
  viewerIsMember: boolean;
}

interface Material {
  id: string;
  addedById: string;
  title: string;
  url: string;
  note: string | null;
}

type Status = "loading" | "success" | "not_found" | "error";

function toNullableValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export default function LearningRoomDetailPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const { user, accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();

  const [status, setStatus] = useState<Status>("loading");
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isMembershipPending, setIsMembershipPending] = useState(false);
  const [busyMaterialId, setBusyMaterialId] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formError, setFormError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(() => {
    if (!accessToken) return;
    return Promise.all([
      fetch(`/api/learning-rooms/${roomId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch(`/api/learning-rooms/${roomId}/materials`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ])
      .then(async ([roomResponse, materialsResponse]) => {
        if (roomResponse.status === 404) {
          setStatus("not_found");
          return;
        }
        if (!roomResponse.ok || !materialsResponse.ok) {
          setStatus("error");
          return;
        }
        const roomData = await roomResponse.json();
        const materialsData = await materialsResponse.json();
        setRoom(roomData.room);
        setMaterials(materialsData.materials);
        setStatus("success");
      })
      .catch(() => setStatus("error"));
  }, [accessToken, roomId]);

  useEffect(() => {
    if (isSessionLoading || !user) return;
    load();
  }, [isSessionLoading, user, load]);

  async function handleJoin() {
    if (!accessToken || isMembershipPending) return;
    setIsMembershipPending(true);
    try {
      const response = await fetch(`/api/learning-rooms/${roomId}/members`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        toast({ title: "Не вдалося приєднатись", variant: "danger" });
        return;
      }
      await load();
    } finally {
      setIsMembershipPending(false);
    }
  }

  async function handleLeave() {
    if (!accessToken || isMembershipPending) return;
    setIsMembershipPending(true);
    try {
      const response = await fetch(`/api/learning-rooms/${roomId}/members`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        toast({ title: "Не вдалося вийти з кімнати", variant: "danger" });
        return;
      }
      await load();
    } finally {
      setIsMembershipPending(false);
    }
  }

  async function handleAddMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;

    setFormError(undefined);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/learning-rooms/${roomId}/materials`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: formTitle.trim(),
          url: formUrl.trim(),
          note: toNullableValue(formNote),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setFormError(
          body?.error?.message ??
            "Не вдалося додати матеріал. Спробуйте ще раз.",
        );
        return;
      }

      setFormTitle("");
      setFormUrl("");
      setFormNote("");
      toast({ title: "Матеріал додано", variant: "success" });
      await load();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteMaterial(materialId: string) {
    if (!accessToken) return;
    setBusyMaterialId(materialId);
    try {
      const response = await fetch(
        `/api/learning-rooms/${roomId}/materials/${materialId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!response.ok) {
        toast({ title: "Не вдалося видалити матеріал", variant: "danger" });
        return;
      }
      toast({ title: "Матеріал видалено", variant: "success" });
      await load();
    } finally {
      setBusyMaterialId(null);
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
            Щоб переглянути кімнату, спершу увійдіть.
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
        <p className="text-sm text-foreground/60">Кімнату не знайдено.</p>
      </div>
    );
  }

  if (status === "error" || !room) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-danger">
          Не вдалося завантажити кімнату. Спробуйте ще раз.
        </p>
      </div>
    );
  }

  const isHost = room.hostId === user.id;

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <Card className="w-full max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
        <CardTitle>{room.title}</CardTitle>
        {room.description && (
          <CardDescription className="mb-2">{room.description}</CardDescription>
        )}

        <Link
          href={`/users/${room.host.username}`}
          className="mt-2 flex items-center gap-2"
        >
          <Avatar
            src={room.host.avatarUrl}
            alt={room.host.displayName ?? room.host.username}
            size={32}
          />
          <span className="text-sm text-foreground/80">
            {room.host.displayName ?? room.host.username}
          </span>
        </Link>

        <div className="mt-6">
          {!isHost && !room.viewerIsMember && (
            <Button
              className="w-full"
              disabled={isMembershipPending}
              onClick={handleJoin}
            >
              {isMembershipPending ? "Приєднуємось..." : "Приєднатись"}
            </Button>
          )}
          {!isHost && room.viewerIsMember && (
            <Button
              variant="secondary"
              className="w-full"
              disabled={isMembershipPending}
              onClick={handleLeave}
            >
              {isMembershipPending ? "Виходимо..." : "Покинути кімнату"}
            </Button>
          )}
          {isHost && (
            <p className="text-center text-sm text-foreground/60">
              Ти хост цієї кімнати.
            </p>
          )}
        </div>

        <div className="mt-6">
          <div className="mb-2 text-sm font-medium">Матеріали</div>

          {materials.length === 0 && (
            <p className="py-4 text-center text-sm text-foreground/60">
              Ще немає жодного матеріалу.
            </p>
          )}

          <div className="flex flex-col gap-1">
            {materials.map((material) => {
              const canManage = material.addedById === user.id || isHost;
              return (
                <div
                  key={material.id}
                  className="rounded-card border border-foreground/10 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={material.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-sm font-medium text-primary hover:underline"
                    >
                      {material.title}
                    </a>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyMaterialId === material.id}
                        onClick={() => handleDeleteMaterial(material.id)}
                      >
                        Видалити
                      </Button>
                    )}
                  </div>
                  {material.note && (
                    <p className="mt-1 text-sm text-foreground/60">
                      {material.note}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {(isHost || room.viewerIsMember) && (
            <form
              onSubmit={handleAddMaterial}
              className="mt-4 flex flex-col gap-3"
              noValidate
            >
              <Input
                label="Назва"
                value={formTitle}
                onChange={(event) => setFormTitle(event.target.value)}
                maxLength={200}
                required
              />
              <Input
                label="Посилання"
                type="url"
                value={formUrl}
                onChange={(event) => setFormUrl(event.target.value)}
                required
              />
              <Textarea
                label="Нотатка (опційно)"
                value={formNote}
                onChange={(event) => setFormNote(event.target.value)}
                maxLength={2000}
              />
              {formError && <p className="text-sm text-danger">{formError}</p>}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Додаємо..." : "Додати матеріал"}
              </Button>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
