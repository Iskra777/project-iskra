import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
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
      <Card style={styles.card}>
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
  container: { padding: 16, gap: 16 },
  card: { gap: 4 },
  header: { flexDirection: "row", alignItems: "center", gap: 16 },
  headerText: { flex: 1 },
  fields: { marginTop: 16, gap: 8 },
  field: { fontSize: 14 },
  actions: { marginTop: 16, gap: 8 },
  achievementsHint: { marginBottom: 8 },
  emptyState: { paddingVertical: 12, fontSize: 13, textAlign: "center" },
  achievement: { paddingVertical: 10, borderTopWidth: 1 },
  achievementRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  achievementTitle: { fontSize: 14, fontWeight: "500" },
  achievementDate: { fontSize: 12 },
  achievementDescription: { fontSize: 13, marginTop: 2 },
});
