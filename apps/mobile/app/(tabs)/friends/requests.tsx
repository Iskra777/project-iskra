import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";
import * as api from "@/lib/api";
import type { FriendRequest } from "@/lib/api";
import { useSession } from "@/lib/session-context";

type Status = "loading" | "success" | "error";

export default function FriendRequestsScreen() {
  const { user, accessToken } = useSession();
  const colors = Colors[useColorScheme()];

  const [status, setStatus] = useState<Status>("loading");
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [respondingId, setRespondingId] = useState<string>();

  const load = useCallback(async () => {
    if (!accessToken) return;
    const result = await api.getFriendRequests(accessToken);
    if (!result.ok) {
      setStatus("error");
      return;
    }
    setRequests(result.data.requests);
    setStatus("success");
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRespond(
    request: FriendRequest,
    action: "accept" | "reject",
  ) {
    if (!accessToken) return;
    setRespondingId(request.id);
    try {
      const result = await api.respondFriendRequest(
        accessToken,
        request.requester.username,
        action,
      );
      if (!result.ok) return;
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
    } finally {
      setRespondingId(undefined);
    }
  }

  if (!user) return null;

  return (
    <FlatList
      data={requests}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      renderItem={({ item: request }) => (
        <View style={styles.row}>
          <Avatar
            uri={request.requester.avatarUrl}
            fallback={
              request.requester.displayName ?? request.requester.username
            }
            size={40}
          />
          <View style={styles.rowText}>
            <Text style={styles.name} numberOfLines={1}>
              {request.requester.displayName ?? request.requester.username}
            </Text>
            <Text style={[styles.username, { color: colors.tabIconDefault }]}>
              @{request.requester.username}
            </Text>
          </View>
          <View style={styles.actions}>
            <Button
              title="Прийняти"
              disabled={respondingId === request.id}
              onPress={() => handleRespond(request, "accept")}
              style={styles.smallButton}
            />
            <Button
              title="Відхилити"
              variant="secondary"
              disabled={respondingId === request.id}
              onPress={() => handleRespond(request, "reject")}
              style={styles.smallButton}
            />
          </View>
        </View>
      )}
      ListEmptyComponent={
        status === "loading" ? (
          <Text style={styles.stateText}>Завантажуємо...</Text>
        ) : status === "error" ? (
          <Text style={[styles.stateText, { color: colors.danger }]}>
            Не вдалося завантажити запити. Спробуйте ще раз.
          </Text>
        ) : (
          <Text style={styles.stateText}>Немає нових запитів.</Text>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md, gap: Spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm + Spacing.xs,
    flexWrap: "wrap",
    paddingVertical: Spacing.sm,
  },
  rowText: { flex: 1, minWidth: 120 },
  name: { ...Typography.small, fontWeight: "500" },
  username: { ...Typography.small, marginTop: Spacing.xs / 2 },
  actions: { flexDirection: "row", gap: Spacing.xs + 2 },
  smallButton: { height: 36, paddingHorizontal: Spacing.sm + Spacing.xs },
  stateText: {
    ...Typography.small,
    marginTop: Spacing.lg,
    textAlign: "center",
    opacity: 0.6,
  },
});
