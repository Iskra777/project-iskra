"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { useSession } from "@/lib/auth/session-context";

interface ConversationListItem {
  id: string;
  type: string;
  title: string | null;
  otherParticipant: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
  lastMessage: {
    content: string;
    senderId: string;
    sentAt: string;
  } | null;
  unread: boolean;
}

type Status = "loading" | "success" | "error";

function formatTimestamp(sentAt: string) {
  const date = new Date(sentAt);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday
    ? date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("uk-UA");
}

export default function MessagesPage() {
  const { user, accessToken, isLoading: isSessionLoading } = useSession();

  const [status, setStatus] = useState<Status>("loading");
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    [],
  );

  useEffect(() => {
    if (isSessionLoading || !accessToken) return;

    let cancelled = false;

    fetch("/api/conversations", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setStatus("error");
          return;
        }
        const data = await response.json();
        setConversations(data.conversations);
        setStatus("success");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, isSessionLoading]);

  if (isSessionLoading || status === "loading") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center md:max-w-md lg:max-w-lg xl:max-w-xl">
          <CardTitle>Завантажуємо...</CardTitle>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <Card className="w-full max-w-sm text-center md:max-w-md lg:max-w-lg xl:max-w-xl">
          <CardTitle>Потрібен вхід</CardTitle>
          <CardDescription className="mb-6">
            Щоб переглянути повідомлення, спершу увійдіть.
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
        <div className="mb-6 flex items-center justify-between">
          <div>
            <CardTitle>Повідомлення</CardTitle>
            <CardDescription>Твої розмови.</CardDescription>
          </div>
          <Link href="/messages/new-group">
            <Button variant="secondary" size="sm">
              Нова група
            </Button>
          </Link>
        </div>

        {status === "error" && (
          <p className="py-6 text-center text-sm text-danger">
            Не вдалося завантажити розмови. Спробуйте ще раз.
          </p>
        )}

        {status === "success" && conversations.length === 0 && (
          <p className="py-6 text-center text-sm text-foreground/60">
            Ще немає розмов. Напиши другу з його профілю.
          </p>
        )}

        <div className="flex flex-col gap-1">
          {status === "success" &&
            conversations.map((conversation) => {
              const other = conversation.otherParticipant;
              const name =
                conversation.type === "group"
                  ? (conversation.title ?? "Група")
                  : (other?.displayName ?? other?.username ?? "Розмова");

              return (
                <Link
                  key={conversation.id}
                  href={`/messages/${conversation.id}`}
                  className="flex items-center gap-3 rounded-card p-3 transition-colors duration-150 hover:bg-background"
                >
                  <Avatar
                    src={
                      conversation.type === "group" ? null : other?.avatarUrl
                    }
                    alt={name}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {name}
                      </span>
                      {conversation.lastMessage && (
                        <span className="shrink-0 text-xs text-foreground/60">
                          {formatTimestamp(conversation.lastMessage.sentAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          conversation.unread
                            ? "truncate text-sm font-medium text-foreground"
                            : "truncate text-sm text-foreground/60"
                        }
                      >
                        {conversation.lastMessage?.content ??
                          "Немає повідомлень"}
                      </span>
                      {conversation.unread && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
        </div>
      </Card>
    </div>
  );
}
