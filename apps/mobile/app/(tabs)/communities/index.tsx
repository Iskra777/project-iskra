import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";
import * as api from "@/lib/api";
import type { CommunityListItem } from "@/lib/api";
import { useSession } from "@/lib/session-context";

type Status = "loading" | "success" | "error";

const DEBOUNCE_MS = 300;

export default function CommunitiesScreen() {
  const { user, accessToken } = useSession();
  const router = useRouter();
  const colors = Colors[useColorScheme()];

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("loading");
  const [communities, setCommunities] = useState<CommunityListItem[]>([]);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setStatus("loading");
      const result = await api.getCommunities(
        accessToken,
        trimmedQuery || undefined,
      );
      if (cancelled) return;
      if (!result.ok) {
        setStatus("error");
        return;
      }
      setCommunities(result.data.communities);
      setStatus("success");
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [accessToken, trimmedQuery]);

  if (!user) return null;

  return (
    <FlatList
      data={communities}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          <Button
            title="Нова спільнота"
            variant="secondary"
            onPress={() => router.push("/(tabs)/communities/new")}
          />
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Назва спільноти..."
            autoFocus
          />
        </View>
      }
      renderItem={({ item: community }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/(tabs)/communities/${community.id}`)}
          style={styles.row}
        >
          <Text style={styles.name} numberOfLines={1}>
            {community.name}
          </Text>
          <Text style={[styles.meta, { color: colors.tabIconDefault }]}>
            {community.visibility === "public" ? "Публічна" : "Приватна"} ·{" "}
            {community.memberCount}{" "}
            {community.memberCount === 1 ? "учасник" : "учасників"}
          </Text>
        </Pressable>
      )}
      ListEmptyComponent={
        status === "loading" ? (
          <Text style={styles.stateText}>Завантажуємо...</Text>
        ) : status === "error" ? (
          <Text style={[styles.stateText, { color: colors.danger }]}>
            Не вдалося завантажити спільноти. Спробуйте ще раз.
          </Text>
        ) : (
          <Text style={styles.stateText}>Нічого не знайдено.</Text>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md, gap: Spacing.xs },
  headerBlock: { gap: Spacing.sm + Spacing.xs, marginBottom: Spacing.sm },
  row: { paddingVertical: Spacing.sm + 2 },
  name: { ...Typography.small, fontWeight: "500" },
  meta: { ...Typography.small, marginTop: Spacing.xs / 2 },
  stateText: {
    ...Typography.small,
    marginTop: Spacing.lg,
    textAlign: "center",
    opacity: 0.6,
  },
});
