"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
  description: string | null;
  visibility: "public" | "private";
  ownerId: string;
  memberCount: number;
  members: MemberSummary[] | null;
  viewerMembership: { role: string; status: "approved" | "pending" } | null;
  pendingRequests: MemberSummary[] | null;
}

type Status = "loading" | "success" | "not_found" | "error";

function roleLabel(role: string) {
  if (role === "admin") return "Адмін";
  if (role === "moderator") return "Модератор";
  return "Учасник";
}

export default function CommunityPage() {
  const { id: communityId } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();

  const [status, setStatus] = useState<Status>("loading");
  const [community, setCommunity] = useState<CommunityDetail | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
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

  async function handleJoin() {
    if (!accessToken) {
      router.push("/login");
      return;
    }
    setIsJoining(true);
    try {
      const response = await fetch(`/api/communities/${communityId}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        toast({ title: "Не вдалося вступити", variant: "danger" });
        return;
      }
      const body = await response.json();
      toast({
        title:
          body.status === "approved"
            ? "Ви вступили до спільноти"
            : "Заявку на вступ надіслано",
        variant: "success",
      });
      await load();
    } finally {
      setIsJoining(false);
    }
  }

  async function handleLeave() {
    if (!accessToken) return;
    setIsLeaving(true);
    try {
      const response = await fetch(`/api/communities/${communityId}/leave`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        toast({ title: "Не вдалося покинути спільноту", variant: "danger" });
        return;
      }
      toast({ title: "Ви покинули спільноту", variant: "success" });
      await load();
    } finally {
      setIsLeaving(false);
    }
  }

  async function respondToRequest(
    targetUserId: string,
    action: "approve" | "reject",
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
          body: JSON.stringify({ action }),
        },
      );
      if (!response.ok) {
        toast({ title: "Не вдалося обробити заявку", variant: "danger" });
        return;
      }
      toast({
        title: action === "approve" ? "Заявку схвалено" : "Заявку відхилено",
        variant: "success",
      });
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

  const isOwner = user?.id === community.ownerId;
  const isModerator =
    community.viewerMembership?.status === "approved" &&
    (community.viewerMembership.role === "admin" ||
      community.viewerMembership.role === "moderator");

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-12">
      <Card className="w-full max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <CardTitle>{community.name}</CardTitle>
            <CardDescription>
              {community.visibility === "public" ? "Публічна" : "Приватна"} ·{" "}
              {community.memberCount}{" "}
              {community.memberCount === 1 ? "учасник" : "учасників"}
            </CardDescription>
          </div>
          {isModerator && (
            <Link href={`/communities/${communityId}/members`}>
              <Button variant="secondary" size="sm">
                Керувати учасниками
              </Button>
            </Link>
          )}
        </div>

        {community.description && (
          <p className="mb-4 text-sm text-foreground/80">
            {community.description}
          </p>
        )}

        <div className="mb-6">
          {!community.viewerMembership && (
            <Button
              className="w-full"
              disabled={isJoining}
              onClick={handleJoin}
            >
              {isJoining ? "Вступаємо..." : "Вступити"}
            </Button>
          )}

          {community.viewerMembership?.status === "pending" && (
            <p className="text-center text-sm text-foreground/60">
              Заявку подано, очікує розгляду.
            </p>
          )}

          {community.viewerMembership?.status === "approved" && isOwner && (
            <p className="text-center text-sm text-foreground/60">
              Ви власник цієї спільноти.
            </p>
          )}

          {community.viewerMembership?.status === "approved" && !isOwner && (
            <Button
              variant="secondary"
              className="w-full"
              disabled={isLeaving}
              onClick={handleLeave}
            >
              {isLeaving ? "Виходимо..." : "Покинути спільноту"}
            </Button>
          )}
        </div>

        {isModerator &&
          community.pendingRequests &&
          community.pendingRequests.length > 0 && (
            <div className="mb-6">
              <div className="mb-2 text-sm font-medium">Заявки на вступ</div>
              <div className="flex flex-col gap-1">
                {community.pendingRequests.map((applicant) => (
                  <div
                    key={applicant.id}
                    className="flex items-center justify-between gap-2 rounded-card p-2"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar
                        src={applicant.avatarUrl}
                        alt={applicant.displayName ?? applicant.username}
                        size={36}
                      />
                      <span className="truncate text-sm font-medium">
                        {applicant.displayName ?? applicant.username}
                      </span>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        disabled={busyUserId === applicant.id}
                        onClick={() =>
                          respondToRequest(applicant.id, "approve")
                        }
                      >
                        Схвалити
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busyUserId === applicant.id}
                        onClick={() => respondToRequest(applicant.id, "reject")}
                      >
                        Відхилити
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        <div>
          <div className="mb-2 text-sm font-medium">Учасники</div>
          {community.members === null && (
            <p className="text-sm text-foreground/60">
              Список учасників видно лише учасникам спільноти.
            </p>
          )}
          {community.members && (
            <div className="flex flex-col gap-1">
              {community.members.map((member) => (
                <Link
                  key={member.id}
                  href={`/users/${member.username}`}
                  className="flex items-center gap-3 rounded-card p-2 transition-colors duration-150 hover:bg-background"
                >
                  <Avatar
                    src={member.avatarUrl}
                    alt={member.displayName ?? member.username}
                    size={36}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {member.displayName ?? member.username}
                    </div>
                    <div className="text-xs text-foreground/60">
                      {roleLabel(member.role)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
