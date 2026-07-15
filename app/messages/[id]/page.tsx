"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/auth/session-context";
import { useToast } from "@/components/ui/toast";

interface Participant {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
}

interface ConversationDetail {
  id: string;
  type: string;
  title: string | null;
  otherParticipant: Participant | null;
  participants: Participant[];
}

interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  sentAt: string;
}

type Status = "loading" | "success" | "not_found" | "error";

const TYPING_THROTTLE_MS = 2000;
const TYPING_INDICATOR_MS = 3000;

function formatTime(sentAt: string) {
  return new Date(sentAt).toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatPage() {
  const { id: conversationId } = useParams<{ id: string }>();
  const { user, accessToken, isLoading: isSessionLoading } = useSession();
  const { toast } = useToast();

  const [status, setStatus] = useState<Status>("loading");
  const [conversation, setConversation] = useState<ConversationDetail | null>(
    null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollActionRef = useRef<"bottom" | "preserve" | null>(null);
  const preserveHeightRef = useRef(0);
  const lastTypingSentRef = useRef(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markRead = useCallback(() => {
    if (!accessToken) return;
    fetch(`/api/conversations/${conversationId}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {});
  }, [accessToken, conversationId]);

  useEffect(() => {
    if (isSessionLoading || !accessToken) return;

    let cancelled = false;

    async function load() {
      try {
        const [conversationRes, historyRes] = await Promise.all([
          fetch(`/api/conversations/${conversationId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          fetch(`/api/conversations/${conversationId}/messages`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        ]);

        if (cancelled) return;

        if (conversationRes.status === 404 || historyRes.status === 404) {
          setStatus("not_found");
          return;
        }
        if (!conversationRes.ok || !historyRes.ok) {
          setStatus("error");
          return;
        }

        const conversationBody = await conversationRes.json();
        const historyBody = await historyRes.json();

        setConversation(conversationBody.conversation);
        setMessages([...historyBody.messages].reverse());
        setNextCursor(historyBody.nextCursor);
        scrollActionRef.current = "bottom";
        setStatus("success");
        markRead();
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, isSessionLoading, conversationId]);

  useEffect(() => {
    if (isSessionLoading || !accessToken || status !== "success") return;

    const wsPort = process.env.NEXT_PUBLIC_WS_PORT ?? "4001";
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(
      `${protocol}://${window.location.hostname}:${wsPort}/?token=${accessToken}`,
    );
    wsRef.current = socket;

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "join", conversationId }));
    });

    socket.addEventListener("message", (event) => {
      const frame = JSON.parse(event.data);

      if (
        frame.type === "message" &&
        frame.message.conversationId === conversationId
      ) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === frame.message.id)) return prev;
          scrollActionRef.current = "bottom";
          return [...prev, frame.message];
        });
        if (frame.message.senderId !== user?.id) {
          markRead();
          setIsOtherTyping(false);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        }
        return;
      }

      if (frame.type === "read" && frame.conversationId === conversationId) {
        if (frame.userId !== user?.id) {
          setOtherLastReadAt(frame.lastReadAt);
        }
        return;
      }

      if (frame.type === "typing" && frame.conversationId === conversationId) {
        if (frame.userId === user?.id) return;
        setIsOtherTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(
          () => setIsOtherTyping(false),
          TYPING_INDICATOR_MS,
        );
      }
    });

    return () => {
      socket.close();
      wsRef.current = null;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, isSessionLoading, status, conversationId, user?.id]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    if (scrollActionRef.current === "bottom") {
      list.scrollTop = list.scrollHeight;
    } else if (scrollActionRef.current === "preserve") {
      list.scrollTop = list.scrollHeight - preserveHeightRef.current;
    }
    scrollActionRef.current = null;
  }, [messages]);

  async function loadOlder() {
    if (!nextCursor || !accessToken || isLoadingOlder) return;
    setIsLoadingOlder(true);
    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/messages?before=${nextCursor}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) return;
      const body = await response.json();
      preserveHeightRef.current = listRef.current?.scrollHeight ?? 0;
      scrollActionRef.current = "preserve";
      setMessages((prev) => [...[...body.messages].reverse(), ...prev]);
      setNextCursor(body.nextCursor);
    } finally {
      setIsLoadingOlder(false);
    }
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    wsRef.current.send(JSON.stringify({ type: "typing", conversationId }));
  }

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !accessToken || isSending) return;

    setIsSending(true);
    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ content }),
        },
      );
      if (!response.ok) {
        toast({
          title: "Не вдалося надіслати повідомлення",
          variant: "danger",
        });
        return;
      }
      const body = await response.json();
      setMessages((prev) => {
        if (prev.some((m) => m.id === body.message.id)) return prev;
        scrollActionRef.current = "bottom";
        return [...prev, body.message];
      });
      setDraft("");
    } catch {
      toast({ title: "Немає з'єднання із сервером", variant: "danger" });
    } finally {
      setIsSending(false);
    }
  }

  if (isSessionLoading || status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-foreground/60">Завантажуємо...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-foreground/60">
          Щоб переглянути розмову, спершу увійдіть.
        </p>
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-foreground/60">Розмову не знайдено.</p>
        <Link href="/messages">
          <Button variant="secondary" size="sm">
            До списку розмов
          </Button>
        </Link>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-danger">
          Не вдалося завантажити розмову. Спробуйте ще раз.
        </p>
      </div>
    );
  }

  const lastOwnMessage = [...messages]
    .reverse()
    .find((m) => m.senderId === user.id);
  const isLastOwnMessageRead =
    lastOwnMessage !== undefined &&
    otherLastReadAt !== null &&
    new Date(otherLastReadAt) >= new Date(lastOwnMessage.sentAt);

  const isGroup = conversation?.type === "group";
  const headerName = isGroup
    ? (conversation?.title ?? "Група")
    : (conversation?.otherParticipant?.displayName ??
      conversation?.otherParticipant?.username);
  const participantsById = new Map(
    (conversation?.participants ?? []).map((p) => [p.id, p]),
  );

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-foreground/10 bg-card px-4 py-3">
        <Link href="/messages">
          <Button variant="ghost" size="sm">
            ←
          </Button>
        </Link>
        <Avatar
          src={isGroup ? null : conversation?.otherParticipant?.avatarUrl}
          alt={headerName ?? "?"}
          size={36}
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{headerName}</div>
          {isGroup && (
            <div className="truncate text-xs text-foreground/60">
              {conversation?.participants.length} учасників
            </div>
          )}
          {isOtherTyping && (
            <div className="text-xs text-primary">набирає текст...</div>
          )}
        </div>
        {isGroup && (
          <Link
            href={`/messages/${conversationId}/participants`}
            className="ml-auto"
          >
            <Button variant="ghost" size="sm">
              Учасники
            </Button>
          </Link>
        )}
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4">
        {nextCursor && (
          <div className="mb-4 flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={loadOlder}
              disabled={isLoadingOlder}
            >
              {isLoadingOlder ? "Завантаження..." : "Завантажити старіші"}
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {messages.map((message) => {
            const isOwn = message.senderId === user.id;
            const sender = participantsById.get(message.senderId);
            return (
              <div
                key={message.id}
                className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-card px-3 py-2 text-sm ${
                    isOwn ? "bg-primary text-white" : "bg-card text-foreground"
                  }`}
                >
                  {isGroup && !isOwn && (
                    <div className="mb-0.5 text-xs font-medium text-primary">
                      {sender?.displayName ?? sender?.username ?? "?"}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">
                    {message.content}
                  </div>
                  <div
                    className={`mt-1 text-right text-xs ${
                      isOwn ? "text-white/70" : "text-foreground/50"
                    }`}
                  >
                    {formatTime(message.sentAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* У групі "read" від WS не каже, хто саме прочитав — показ
            індикатора однозначний лише для 1:1, тому тут вимкнено. */}
        {!isGroup && lastOwnMessage && isLastOwnMessageRead && (
          <div className="mt-1 text-right text-xs text-foreground/50">
            Прочитано
          </div>
        )}
      </div>

      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-foreground/10 bg-card px-4 py-3"
      >
        <Input
          value={draft}
          onChange={(event) => handleDraftChange(event.target.value)}
          placeholder="Написати повідомлення..."
          className="flex-1"
          maxLength={5000}
        />
        <Button type="submit" size="sm" disabled={!draft.trim() || isSending}>
          Надіслати
        </Button>
      </form>
    </div>
  );
}
