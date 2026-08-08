import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";
import * as api from "@/lib/api";
import type { Achievement } from "@/lib/api";
import { useSession } from "@/lib/session-context";

function formatEarnedAt(earnedAt: string) {
  return new Date(earnedAt).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function ProfileScreen() {
  const { user, accessToken, logout } = useSession();
  const router = useRouter();
  const colors = Colors[useColorScheme()];

  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [isLoadingAchievements, setIsLoadingAchievements] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    api
      .getAchievements(accessToken)
      .then((result) => {
        if (result.ok) setAchievements(result.data.achievements);
      })
      .finally(() => setIsLoadingAchievements(false));
  }, [accessToken]);

  if (!user) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View
        style={[
          styles.section,
          styles.sectionDivider,
          { borderBottomColor: colors.border },
        ]}
      >
        <View style={styles.header}>
          <Avatar
            uri={user.avatarUrl}
            fallback={user.displayName ?? user.username}
            size={80}
          />
          <View style={styles.headerText}>
            <CardTitle>{user.displayName ?? user.username}</CardTitle>
            <CardDescription>@{user.username}</CardDescription>
          </View>
        </View>

        <View style={styles.fields}>
          <Text style={styles.field}>
            <Text style={{ color: colors.tabIconDefault }}>Email: </Text>
            {user.email}
          </Text>
          {user.bio && (
            <Text style={styles.field}>
              <Text style={{ color: colors.tabIconDefault }}>Про себе: </Text>
              {user.bio}
            </Text>
          )}
          {user.location && (
            <Text style={styles.field}>
              <Text style={{ color: colors.tabIconDefault }}>Локація: </Text>
              {user.location}
            </Text>
          )}
          <Text style={styles.field}>
            <Text style={{ color: colors.tabIconDefault }}>
              Email підтверджено:{" "}
            </Text>
            {user.isEmailVerified ? "так" : "ні"}
          </Text>
        </View>

        <View style={styles.actions}>
          <Button
            title="Редагувати профіль"
            variant="secondary"
            onPress={() => router.push("/(tabs)/profile/edit")}
          />
          <Button title="Вийти" variant="secondary" onPress={logout} />
        </View>
      </View>

      <Card style={styles.card}>
        <CardTitle>Швидкі посилання</CardTitle>
        <Button
          title="🔖 Закладки"
          variant="secondary"
          onPress={() => router.push("/(tabs)/profile/bookmarks")}
        />
        <Button
          title="🎯 Цілі"
          variant="secondary"
          onPress={() => router.push("/(tabs)/profile/goals")}
        />
        <Button
          title="📔 Щоденник"
          variant="secondary"
          onPress={() => router.push("/(tabs)/profile/diary")}
        />
      </Card>

      <Card style={styles.card}>
        <CardTitle>Досягнення</CardTitle>
        <CardDescription style={styles.achievementsHint}>
          Бачиш лише ти.
        </CardDescription>

        {isLoadingAchievements && (
          <Text style={styles.emptyState}>Завантажуємо...</Text>
        )}

        {!isLoadingAchievements && achievements.length === 0 && (
          <Text style={styles.emptyState}>Ще немає жодного досягнення.</Text>
        )}

        {!isLoadingAchievements &&
          achievements.map((achievement) => (
            <View
              key={achievement.code}
              style={[styles.achievement, { borderTopColor: colors.border }]}
            >
              <View style={styles.achievementRow}>
                <Text style={styles.achievementTitle}>{achievement.title}</Text>
                <Text
                  style={[
                    styles.achievementDate,
                    { color: colors.tabIconDefault },
                  ]}
                >
                  {formatEarnedAt(achievement.earnedAt)}
                </Text>
              </View>
              {achievement.description && (
                <Text
                  style={[
                    styles.achievementDescription,
                    { color: colors.tabIconDefault },
                  ]}
                >
                  {achievement.description}
                </Text>
              )}
            </View>
          ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md, gap: Spacing.lg },
  section: { gap: Spacing.xs },
  sectionDivider: { paddingBottom: Spacing.lg, borderBottomWidth: 1 },
  card: { gap: Spacing.xs },
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  headerText: { flex: 1 },
  fields: { marginTop: Spacing.md, gap: Spacing.sm },
  field: Typography.small,
  actions: { marginTop: Spacing.md, gap: Spacing.sm },
  achievementsHint: { marginBottom: Spacing.sm },
  emptyState: {
    ...Typography.small,
    paddingVertical: Spacing.sm + Spacing.xs,
    textAlign: "center",
  },
  achievement: {
    paddingVertical: Spacing.sm + 2,
    borderTopWidth: 1,
    backgroundColor: "transparent",
  },
  achievementRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.sm,
    backgroundColor: "transparent",
  },
  achievementTitle: { ...Typography.small, fontWeight: "500" },
  achievementDate: { ...Typography.small },
  achievementDescription: { ...Typography.small, marginTop: Spacing.xs / 2 },
});
