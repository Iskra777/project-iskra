import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
} from "react-native";

import { Text, View } from "@/components/Themed";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import * as api from "@/lib/api";
import type { ChatMessage, ConversationDetail } from "@/lib/api";
import { useSession } from "@/lib/session-context";

type Status = "loading" | "success" | "not_found" | "error";

const TYPING_THROTTLE_MS = 2000;
const TYPING_INDICATOR_MS = 3000;

function formatTime(sentAt: string) {
  return new Date(sentAt).toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { user, accessToken } = useSession();
  const router = useRouter();
  const colors = Colors[useColorScheme()];

  const [status, setStatus] = useState<Status>("loading");
  const [conversation, setConversation] = useState<ConversationDetail | null>(
    null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const nextCursorRef = useRef<string | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markRead = useCallback(() => {
    if (!accessToken) return;
    api.markConversationRead(accessToken, conversationId).catch(() => {});
  }, [accessToken, conversationId]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    async function load() {
      const [conversationResult, historyResult] = await Promise.all([
        api.getConversation(accessToken!, conversationId),
        api.getMessages(accessToken!, conversationId),
      ]);
      if (cancelled) return;

      if (!conversationResult.ok) {
        setStatus(conversationResult.status === 404 ? "not_found" : "error");
        return;
      }
      if (!historyResult.ok) {
        setStatus(historyResult.status === 404 ? "not_found" : "error");
        return;
      }

      setConversation(conversationResult.data.conversation);
      setMessages(historyResult.data.messages.reverse());
      nextCursorRef.current = historyResult.data.nextCursor;
      setStatus("success");
      markRead();
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, conversationId]);

  useEffect(() => {
    if (!accessToken || status !== "success") return;

    const apiUrl = new URL(api.API_URL);
    const protocol = apiUrl.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(
      `${protocol}://${apiUrl.hostname}:${api.WS_PORT}/?token=${accessToken}`,
    );
    wsRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "join", conversationId }));
    };

    socket.onmessage = (event) => {
      const frame = JSON.parse(event.data);

      if (
        frame.type === "message" &&
        frame.message.conversationId === conversationId
      ) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === frame.message.id)) return prev;
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
        if (frame.userId !== user?.id) setOtherLastReadAt(frame.lastReadAt);
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
    };

    return () => {
      socket.close();
      wsRef.current = null;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, status, conversationId, user?.id]);

  async function loadOlder() {
    if (!nextCursorRef.current || !accessToken || isLoadingOlder) return;
    setIsLoadingOlder(true);
    try {
      const result = await api.getMessages(
        accessToken,
        conversationId,
        nextCursorRef.current,
      );
      if (!result.ok) return;
      setMessages((prev) => [...result.data.messages.reverse(), ...prev]);
      nextCursorRef.current = result.data.nextCursor;
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

  async function handleSend() {
    const content = draft.trim();
    if (!content || !accessToken || isSending) return;
    setIsSending(true);
    try {
      const result = await api.sendMessage(
        accessToken,
        conversationId,
        content,
      );
      if (!result.ok) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === result.data.message.id)) return prev;
        return [...prev, result.data.message];
      });
      setDraft("");
    } finally {
      setIsSending(false);
    }
  }

  if (!user) return null;

  if (status === "loading") {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <Text>Завантажуємо...</Text>
        </View>
      </>
    );
  }

  if (status === "not_found") {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <Text>Розмову не знайдено.</Text>
          <Button
            title="До списку розмов"
            variant="secondary"
            onPress={() => router.replace("/(tabs)/messages")}
          />
        </View>
      </>
    );
  }

  if (status === "error") {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}>
          <Text style={{ color: colors.danger }}>
            Не вдалося завантажити розмову. Спробуйте ще раз.
          </Text>
          <Button
            title="До списку розмов"
            variant="secondary"
            onPress={() => router.replace("/(tabs)/messages")}
          />
        </View>
      </>
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
  const headerName =
    (isGroup
      ? (conversation?.title ?? "Група")
      : (conversation?.otherParticipant?.displayName ??
        conversation?.otherParticipant?.username)) ?? "Розмова";
  const participantsById = new Map(
    (conversation?.participants ?? []).map((p) => [p.id, p]),
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Avatar
          uri={isGroup ? null : conversation?.otherParticipant?.avatarUrl}
          fallback={headerName}
          size={36}
        />
        <View style={styles.headerText}>
          <Text style={styles.headerName} numberOfLines={1}>
            {headerName}
          </Text>
          {isGroup && (
            <Text style={[styles.headerSub, { color: colors.tabIconDefault }]}>
              {conversation?.participants.length} учасників
            </Text>
          )}
          {isOtherTyping && (
            <Text style={[styles.headerSub, { color: colors.tint }]}>
              набирає текст...
            </Text>
          )}
        </View>
        {isGroup && (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push(`/(tabs)/messages/${conversationId}/participants`)
            }
            style={styles.participantsButton}
          >
            <Text style={{ color: colors.tint, fontSize: 13 }}>Учасники</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        inverted
        data={[...messages].reverse()}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        onEndReachedThreshold={0.5}
        onEndReached={loadOlder}
        renderItem={({ item: message }) => {
          const isOwn = message.senderId === user.id;
          const sender = participantsById.get(message.senderId);
          return (
            <View
              style={[
                styles.bubbleRow,
                { justifyContent: isOwn ? "flex-end" : "flex-start" },
              ]}
            >
              <View
                style={[
                  styles.bubble,
                  {
                    backgroundColor: isOwn ? colors.tint : colors.card,
                  },
                ]}
              >
                {isGroup && !isOwn && (
                  <Text style={[styles.senderName, { color: colors.tint }]}>
                    {sender?.displayName ?? sender?.username ?? "?"}
                  </Text>
                )}
                <Text style={{ color: isOwn ? "#fff" : colors.text }}>
                  {message.content}
                </Text>
                <Text
                  style={[
                    styles.bubbleTime,
                    { color: isOwn ? "#ffffffb3" : colors.tabIconDefault },
                  ]}
                >
                  {formatTime(message.sentAt)}
                </Text>
              </View>
            </View>
          );
        }}
        ListFooterComponent={
          !isGroup && lastOwnMessage && isLastOwnMessageRead ? (
            <Text
              style={[styles.readReceipt, { color: colors.tabIconDefault }]}
            >
              Прочитано
            </Text>
          ) : null
        }
      />

      <View style={[styles.composer, { borderTopColor: colors.border }]}>
        <Input
          value={draft}
          onChangeText={handleDraftChange}
          placeholder="Написати повідомлення..."
          maxLength={5000}
          style={styles.composerInput}
        />
        <Button
          title="Надіслати"
          onPress={handleSend}
          disabled={!draft.trim() || isSending}
          style={styles.sendButton}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backButton: { padding: 4 },
  backArrow: { fontSize: 20 },
  headerText: { flex: 1 },
  headerName: { fontSize: 15, fontWeight: "600" },
  headerSub: { fontSize: 12, marginTop: 1 },
  participantsButton: { padding: 4 },
  list: { padding: 16, gap: 8, flexGrow: 1 },
  bubbleRow: { flexDirection: "row" },
  bubble: {
    maxWidth: "78%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  senderName: { fontSize: 12, fontWeight: "600", marginBottom: 2 },
  bubbleTime: { fontSize: 11, marginTop: 4, textAlign: "right" },
  readReceipt: { fontSize: 12, textAlign: "right", marginTop: 4 },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
  },
  composerInput: { flex: 1, height: 44 },
  sendButton: { paddingHorizontal: 16 },
});
