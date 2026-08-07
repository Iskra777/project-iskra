import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";
import * as api from "@/lib/api";
import type { Friend } from "@/lib/api";
import { useSession } from "@/lib/session-context";
import Colors from "@/constants/Colors";
import { useColorScheme } from "@/components/useColorScheme";

type Status = "loading" | "success" | "error";

export default function FriendsScreen() {
  const { user, accessToken } = useSession();
  const router = useRouter();
  const colors = Colors[useColorScheme()];

  const [status, setStatus] = useState<Status>("loading");
  const [friends, setFriends] = useState<Friend[]>([]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const result = await api.getFriends(accessToken);
    if (!result.ok) {
      setStatus("error");
      return;
    }
    setFriends(result.data.friends);
    setStatus("success");
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;

  return (
    <FlatList
      data={friends}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      ListHeaderComponent={
        <View style={styles.toolbar}>
          <Button
            title="Додати друга"
            variant="secondary"
            onPress={() => router.push("/(tabs)/friends/add")}
            style={styles.toolbarButton}
          />
          <Button
            title="Запити дружби"
            variant="secondary"
            onPress={() => router.push("/(tabs)/friends/requests")}
            style={styles.toolbarButton}
          />
        </View>
      }
      renderItem={({ item: friend }) => (
        <View style={styles.row}>
          <Avatar
            uri={friend.avatarUrl}
            fallback={friend.displayName ?? friend.username}
            size={44}
          />
          <View style={styles.rowText}>
            <Text style={styles.name} numberOfLines={1}>
              {friend.displayName ?? friend.username}
            </Text>
            <Text style={[styles.username, { color: colors.tabIconDefault }]}>
              @{friend.username}
            </Text>
          </View>
        </View>
      )}
      ListEmptyComponent={
        status === "loading" ? (
          <Text style={styles.stateText}>Завантажуємо...</Text>
        ) : status === "error" ? (
          <Text style={[styles.stateText, { color: colors.danger }]}>
            Не вдалося завантажити друзів. Спробуйте ще раз.
          </Text>
        ) : (
          <Text style={styles.stateText}>Ще немає друзів.</Text>
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
  rowText: { flex: 1 },
  name: { ...Typography.small, fontWeight: "500" },
  username: { ...Typography.small, marginTop: Spacing.xs / 2 },
  stateText: {
    ...Typography.small,
    marginTop: Spacing.lg,
    textAlign: "center",
    opacity: 0.6,
  },
});
