import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Button } from "@/components/ui/Button";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";
import * as api from "@/lib/api";
import type { Goal } from "@/lib/api";
import { useSession } from "@/lib/session-context";

type Status = "loading" | "success" | "error";

function statusLabel(status: Goal["status"]) {
  if (status === "completed") return "Завершена";
  if (status === "abandoned") return "Покинута";
  return "Активна";
}

function formatDeadline(deadline: string) {
  return new Date(deadline).toLocaleDateString("uk-UA");
}

export default function GoalsScreen() {
  const { user, accessToken } = useSession();
  const router = useRouter();
  const colors = Colors[useColorScheme()];

  const [status, setStatus] = useState<Status>("loading");
  const [goals, setGoals] = useState<Goal[]>([]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const result = await api.getGoals(accessToken);
    if (!result.ok) {
      setStatus("error");
      return;
    }
    setGoals(result.data.goals);
    setStatus("success");
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;

  return (
    <FlatList
      data={goals}
      keyExtractor={(goal) => goal.id}
      contentContainerStyle={styles.container}
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          <Button
            title="Нова ціль"
            variant="secondary"
            onPress={() => router.push("/(tabs)/profile/goals/new")}
          />
          {status === "loading" && (
            <Text style={styles.stateText}>Завантажуємо...</Text>
          )}
          {status === "error" && (
            <Text style={[styles.stateText, { color: colors.danger }]}>
              Не вдалося завантажити цілі. Спробуйте ще раз.
            </Text>
          )}
          {status === "success" && goals.length === 0 && (
            <Text style={styles.stateText}>Ще немає жодної цілі.</Text>
          )}
        </View>
      }
      renderItem={({ item: goal }) => (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(`/(tabs)/profile/goals/${goal.id}`)}
          style={[styles.row, { borderBottomColor: colors.border }]}
        >
          <View style={styles.rowHeader}>
            <Text style={styles.title} numberOfLines={1}>
              {goal.title}
            </Text>
            <Text style={[styles.status, { color: colors.tabIconDefault }]}>
              {statusLabel(goal.status)}
            </Text>
          </View>
          {goal.deadline && (
            <Text style={[styles.meta, { color: colors.tabIconDefault }]}>
              до {formatDeadline(goal.deadline)}
            </Text>
          )}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md, gap: Spacing.xs },
  headerBlock: { gap: Spacing.sm, marginBottom: Spacing.sm },
  stateText: {
    ...Typography.small,
    textAlign: "center",
    opacity: 0.6,
    paddingVertical: Spacing.sm,
  },
  row: {
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.xs / 2,
  },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.sm,
    backgroundColor: "transparent",
  },
  title: { ...Typography.small, fontWeight: "500", flex: 1 },
  status: Typography.small,
  meta: Typography.small,
});
