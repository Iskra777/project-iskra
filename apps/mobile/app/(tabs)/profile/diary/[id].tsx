import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";
import * as api from "@/lib/api";
import { useSession } from "@/lib/session-context";

type Status = "loading" | "success" | "not_found" | "error";

const TITLE_MAX = 200;
const CONTENT_MAX = 20000;

export default function EditDiaryEntryScreen() {
  const { id: entryId } = useLocalSearchParams<{ id: string }>();
  const { user, accessToken } = useSession();
  const router = useRouter();
  const colors = Colors[useColorScheme()];

  const [status, setStatus] = useState<Status>("loading");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    const result = await api.getDiaryEntry(accessToken, entryId);
    if (!result.ok) {
      setStatus(result.status === 404 ? "not_found" : "error");
      return;
    }
    setTitle(result.data.entry.title ?? "");
    setContent(result.data.entry.content);
    setStatus("success");
  }, [accessToken, entryId]);

  useEffect(() => {
    load();
  }, [load]);

  const canSubmit = content.trim().length > 0 && !isSaving;

  async function handleSave() {
    if (!canSubmit || !accessToken) return;
    setError(undefined);
    setIsSaving(true);
    try {
      const result = await api.updateDiaryEntry(accessToken, entryId, {
        title: title.trim() || null,
        content: content.trim(),
      });
      if (!result.ok) {
        setError("Не вдалося зберегти зміни.");
        return;
      }
      router.replace("/(tabs)/profile/diary");
    } finally {
      setIsSaving(false);
    }
  }

  if (!user) return null;

  if (status === "loading") {
    return (
      <View style={styles.center}>
        <Text>Завантажуємо...</Text>
      </View>
    );
  }

  if (status === "not_found") {
    return (
      <View style={styles.center}>
        <Text>Запис не знайдено.</Text>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.danger }}>
          Не вдалося завантажити запис. Спробуйте ще раз.
        </Text>
      </View>
    );
  }

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
        title={isSaving ? "Зберігаємо..." : "Зберегти зміни"}
        onPress={handleSave}
        disabled={!canSubmit}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  container: { padding: Spacing.md, gap: Spacing.md },
  textarea: {
    height: 220,
    textAlignVertical: "top",
    paddingTop: Spacing.sm + 2,
  },
  errorText: Typography.small,
});
