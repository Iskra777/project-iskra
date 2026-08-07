import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";
import * as api from "@/lib/api";
import type { ConversationListItem } from "@/lib/api";
import { useSession } from "@/lib/session-context";

type Status = "loading" | "success" | "error";

function formatTimestamp(sentAt: string) {
  const date = new Date(sentAt);
  const isToday = date.toDateString() === new Date().toDateString();
  return isToday
    ? date.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("uk-UA");
}

export default function MessagesListScreen() {
  const { user, accessToken } = useSession();
  const router = useRouter();
  const colors = Colors[useColorScheme()];

  const [status, setStatus] = useState<Status>("loading");
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    [],
  );

  const load = useCallback(async () => {
    if (!accessToken) return;
    const result = await api.getConversations(accessToken);
    if (!result.ok) {
      setStatus("error");
      return;
    }
    setConversations(result.data.conversations);
    setStatus("success");
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;

  return (
    <FlatList
      data={conversations}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      ListHeaderComponent={
        <View style={styles.toolbar}>
          <Button
            title="Написати"
            variant="secondary"
            onPress={() => router.push("/(tabs)/messages/new-direct")}
            style={styles.toolbarButton}
          />
          <Button
            title="Нова група"
            variant="secondary"
            onPress={() => router.push("/(tabs)/messages/new-group")}
            style={styles.toolbarButton}
          />
        </View>
      }
      renderItem={({ item }) => {
        const other = item.otherParticipant;
        const name =
          item.type === "group"
            ? (item.title ?? "Група")
            : (other?.displayName ?? other?.username ?? "Розмова");

        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/(tabs)/messages/${item.id}`)}
            style={styles.row}
          >
            <Avatar
              uri={item.type === "group" ? null : other?.avatarUrl}
              fallback={name}
              size={44}
            />
            <View style={styles.rowText}>
              <View style={styles.rowTop}>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                {item.lastMessage && (
                  <Text style={[styles.time, { color: colors.tabIconDefault }]}>
                    {formatTimestamp(item.lastMessage.sentAt)}
                  </Text>
                )}
              </View>
              <View style={styles.rowBottom}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.preview,
                    {
                      color: item.unread ? colors.text : colors.tabIconDefault,
                      fontWeight: item.unread ? "600" : "400",
                    },
                  ]}
                >
                  {item.lastMessage?.content ?? "Немає повідомлень"}
                </Text>
                {item.unread && (
                  <View
                    style={[styles.unreadDot, { backgroundColor: colors.tint }]}
                  />
                )}
              </View>
            </View>
          </Pressable>
        );
      }}
      ListEmptyComponent={
        status === "loading" ? (
          <Text style={styles.stateText}>Завантажуємо...</Text>
        ) : status === "error" ? (
          <Text style={[styles.stateText, { color: colors.danger }]}>
            Не вдалося завантажити розмови. Спробуйте ще раз.
          </Text>
        ) : (
          <Text style={styles.stateText}>
            Ще немає розмов. Натисни "Написати", щоб почати.
          </Text>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md, gap: Spacing.xs },
  toolbar: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.sm + Spacing.xs,
  },
  toolbarButton: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm + Spacing.xs,
    paddingVertical: Spacing.sm + 2,
  },
  rowText: { flex: 1, gap: Spacing.xs / 2 },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  name: { ...Typography.small, fontWeight: "500", flexShrink: 1 },
  time: Typography.small,
  rowBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs + 2,
  },
  preview: { ...Typography.small, flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  stateText: {
    ...Typography.small,
    marginTop: Spacing.lg,
    textAlign: "center",
    opacity: 0.6,
  },
});
