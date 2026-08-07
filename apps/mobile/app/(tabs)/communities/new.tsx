import { useRouter } from "expo-router";
import { useState } from "react";
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

const NAME_MAX = 50;
const DESCRIPTION_MAX = 1000;

export default function NewCommunityScreen() {
  const { user, accessToken } = useSession();
  const router = useRouter();
  const colors = Colors[useColorScheme()];

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [error, setError] = useState<string>();
  const [isCreating, setIsCreating] = useState(false);

  const canSubmit = name.trim().length >= 3 && !isCreating;

  async function handleCreate() {
    if (!canSubmit || !accessToken) return;
    setError(undefined);
    setIsCreating(true);
    try {
      const result = await api.createCommunity(accessToken, {
        name: name.trim(),
        description: description.trim() || null,
        visibility,
      });
      if (!result.ok) {
        setError(
          result.error.code === "name_taken"
            ? "Спільнота з такою назвою вже існує."
            : "Не вдалося створити спільноту.",
        );
        return;
      }
      router.replace(`/(tabs)/communities/${result.data.community.id}`);
    } finally {
      setIsCreating(false);
    }
  }

  if (!user) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Input
        label="Назва"
        value={name}
        onChangeText={setName}
        placeholder="Наприклад, Любителі гір"
        maxLength={NAME_MAX}
      />
      <Input
        label="Опис (необов'язково)"
        value={description}
        onChangeText={setDescription}
        placeholder="Про що ця спільнота?"
        maxLength={DESCRIPTION_MAX}
        multiline
        numberOfLines={4}
        style={styles.textarea}
      />
      <View style={styles.visibilityBlock}>
        <Text style={styles.label}>Видимість</Text>
        <View style={styles.visibilityRow}>
          <Button
            title="Публічна"
            variant={visibility === "public" ? "primary" : "secondary"}
            onPress={() => setVisibility("public")}
            style={styles.visibilityButton}
          />
          <Button
            title="Приватна"
            variant={visibility === "private" ? "primary" : "secondary"}
            onPress={() => setVisibility("private")}
            style={styles.visibilityButton}
          />
        </View>
        <Text style={[styles.hint, { color: colors.tabIconDefault }]}>
          {visibility === "public"
            ? "Будь-хто може вступити одразу."
            : "Вступ — лише після схвалення адміном або модератором."}
        </Text>
      </View>

      {error && (
        <Text style={[styles.errorText, { color: colors.danger }]}>
          {error}
        </Text>
      )}

      <Button
        title={isCreating ? "Створюємо..." : "Створити спільноту"}
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
  visibilityBlock: { gap: Spacing.xs + 2 },
  label: { fontSize: Typography.small.fontSize, fontWeight: "500" },
  visibilityRow: { flexDirection: "row", gap: Spacing.sm },
  visibilityButton: { flex: 1 },
  hint: Typography.small,
  errorText: Typography.small,
});
