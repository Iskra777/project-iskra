"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { useSession } from "@/lib/auth/session-context";
import { useToast } from "@/components/ui/toast";

interface MemberSummary {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "admin" | "moderator" | "member";
}

interface CommunityDetail {
  id: string;
  name: string;
  ownerId: string;
  members: MemberSummary[] | null;
  viewerMembership: { role: string; status: "approved" | "pending" } | null;
}

type Status = "loading" | "success" | "not_found" | "error";

const ROLES: { value: "admin" | "moderator" | "member"; label: string }[] = [
  { value: "admin", label: "Адмін" },
  { value: "moderator", label: "Модератор" },
  { value: "member", label: "Учасник" },
];

export default function CommunityMembersPage() {
  const { id: communityId } = useParams<{ id: string }>();
  const { user, accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();

  const [status, setStatus] = useState<Status>("loading");
  const [community, setCommunity] = useState<CommunityDetail | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const load = useCallback(() => {
    return fetch(`/api/communities/${communityId}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
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
        setCommunity(data.community);
        setStatus("success");
      })
      .catch(() => {
        setStatus("error");
      });
  }, [communityId, accessToken]);

  useEffect(() => {
    if (isSessionLoading) return;
    load();
  }, [isSessionLoading, load]);

  async function handleRoleChange(
    targetUserId: string,
    role: "admin" | "moderator" | "member",
  ) {
    if (!accessToken) return;
    setBusyUserId(targetUserId);
    try {
      const response = await fetch(
        `/api/communities/${communityId}/members/${targetUserId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ role }),
        },
      );
      if (!response.ok) {
        toast({ title: "Не вдалося змінити роль", variant: "danger" });
        return;
      }
      toast({ title: "Роль змінено", variant: "success" });
      await load();
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRemove(targetUserId: string) {
    if (!accessToken) return;
    setBusyUserId(targetUserId);
    try {
      const response = await fetch(
        `/api/communities/${communityId}/members/${targetUserId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (!response.ok) {
        toast({ title: "Не вдалося видалити учасника", variant: "danger" });
        return;
      }
      toast({ title: "Учасника видалено", variant: "success" });
      await load();
    } finally {
      setBusyUserId(null);
    }
  }

  if (isSessionLoading || status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-foreground/60">Завантажуємо...</p>
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-foreground/60">Спільноту не знайдено.</p>
      </div>
    );
  }

  if (status === "error" || !community) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-danger">
          Не вдалося завантажити спільноту. Спробуйте ще раз.
        </p>
      </div>
    );
  }

  const viewerRole =
    community.viewerMembership?.status === "approved"
      ? community.viewerMembership.role
      : null;
  const isAdmin = viewerRole === "admin";
  const isModerator = viewerRole === "admin" || viewerRole === "moderator";

  if (!isModerator) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-foreground/60">
          Керувати учасниками можуть лише адміни й модератори спільноти.
        </p>
        <Link href={`/communities/${communityId}`}>
          <Button variant="secondary" size="sm">
            До сторінки спільноти
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <Card className="w-full max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
        <div className="mb-2 flex items-center gap-3">
          <Link href={`/communities/${communityId}`}>
            <Button variant="ghost" size="sm">
              ←
            </Button>
          </Link>
          <div>
            <CardTitle>Учасники</CardTitle>
            <CardDescription>{community.name}</CardDescription>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-1">
          {community.members?.map((member) => {
            const isSelf = member.id === user?.id;
            const isOwner = member.id === community.ownerId;
            const canRemove =
              !isSelf && !isOwner && (isAdmin || member.role === "member");

            return (
              <div
                key={member.id}
                className="flex flex-col gap-2 rounded-card p-2"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar
                    src={member.avatarUrl}
                    alt={member.displayName ?? member.username}
                    size={36}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {member.displayName ?? member.username}
                      {isSelf && " (ти)"}
                    </div>
                    <div className="text-xs text-foreground/60">
                      {isOwner
                        ? "Власник"
                        : ROLES.find((r) => r.value === member.role)?.label}
                    </div>
                  </div>
                </div>

                {isAdmin && !isSelf && !isOwner && (
                  <div className="flex flex-wrap gap-2 pl-[3.375rem]">
                    {ROLES.map((role) => (
                      <Button
                        key={role.value}
                        variant={
                          member.role === role.value ? "primary" : "secondary"
                        }
                        size="sm"
                        disabled={busyUserId === member.id}
                        onClick={() => handleRoleChange(member.id, role.value)}
                      >
                        {role.label}
                      </Button>
                    ))}
                  </div>
                )}

                {canRemove && (
                  <div className="flex flex-wrap gap-2 pl-[3.375rem]">
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busyUserId === member.id}
                      onClick={() => handleRemove(member.id)}
                    >
                      Видалити
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
