import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { Text } from "@/components/Themed";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";
import * as api from "@/lib/api";
import { useSession } from "@/lib/session-context";

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;

export default function NewGoalScreen() {
  const { user, accessToken } = useSession();
  const router = useRouter();
  const colors = Colors[useColorScheme()];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState<string>();
  const [isCreating, setIsCreating] = useState(false);

  const canSubmit = title.trim().length > 0 && !isCreating;

  async function handleCreate() {
    if (!canSubmit || !accessToken) return;
    setError(undefined);
    setIsCreating(true);
    try {
      const trimmedDeadline = deadline.trim();
      const result = await api.createGoal(accessToken, {
        title: title.trim(),
        description: description.trim() || null,
        deadline: trimmedDeadline
          ? new Date(trimmedDeadline).toISOString()
          : null,
      });
      if (!result.ok) {
        setError("Не вдалося створити ціль.");
        return;
      }
      router.replace(`/(tabs)/profile/goals/${result.data.goal.id}`);
    } finally {
      setIsCreating(false);
    }
  }

  if (!user) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Input
        label="Назва"
        value={title}
        onChangeText={setTitle}
        placeholder="Наприклад, Пробігти 10 км"
        maxLength={TITLE_MAX}
      />
      <Input
        label="Опис (необов'язково)"
        value={description}
        onChangeText={setDescription}
        placeholder="Деталі цілі..."
        maxLength={DESCRIPTION_MAX}
        multiline
        numberOfLines={4}
        style={styles.textarea}
      />
      <Input
        label="Дедлайн (необов'язково)"
        value={deadline}
        onChangeText={setDeadline}
        placeholder="РРРР-ММ-ДД"
      />

      {error && (
        <Text style={[styles.errorText, { color: colors.danger }]}>
          {error}
        </Text>
      )}

      <Button
        title={isCreating ? "Створюємо..." : "Створити ціль"}
        onPress={handleCreate}
        disabled={!canSubmit}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md, gap: Spacing.md },
  textarea: {
    height: 96,
    textAlignVertical: "top",
    paddingTop: Spacing.sm + 2,
  },
  errorText: Typography.small,
});
