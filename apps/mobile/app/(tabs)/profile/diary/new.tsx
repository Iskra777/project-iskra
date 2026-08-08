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
const CONTENT_MAX = 20000;

export default function NewDiaryEntryScreen() {
  const { user, accessToken } = useSession();
  const router = useRouter();
  const colors = Colors[useColorScheme()];

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string>();
  const [isCreating, setIsCreating] = useState(false);

  const canSubmit = content.trim().length > 0 && !isCreating;

  async function handleCreate() {
    if (!canSubmit || !accessToken) return;
    setError(undefined);
    setIsCreating(true);
    try {
      const result = await api.createDiaryEntry(accessToken, {
        title: title.trim() || null,
        content: content.trim(),
      });
      if (!result.ok) {
        setError("Не вдалося зберегти запис.");
        return;
      }
      router.replace("/(tabs)/profile/diary");
    } finally {
      setIsCreating(false);
    }
  }

  if (!user) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Input
        label="Заголовок (необов'язково)"
        value={title}
        onChangeText={setTitle}
        placeholder="Наприклад, Гарний день"
        maxLength={TITLE_MAX}
      />
      <Input
        label="Текст"
        value={content}
        onChangeText={setContent}
        placeholder="Про що ти думаєш?"
        maxLength={CONTENT_MAX}
        multiline
        numberOfLines={10}
        style={styles.textarea}
      />

      {error && (
        <Text style={[styles.errorText, { color: colors.danger }]}>
          {error}
        </Text>
      )}

      <Button
        title={isCreating ? "Зберігаємо..." : "Зберегти запис"}
        onPress={handleCreate}
        disabled={!canSubmit}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: Spacing.md, gap: Spacing.md },
  textarea: {
    height: 220,
    textAlignVertical: "top",
    paddingTop: Spacing.sm + 2,
  },
  errorText: Typography.small,
});
