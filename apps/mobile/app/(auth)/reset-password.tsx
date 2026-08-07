import { Link, useLocalSearchParams, useRouter } from "expo-router";
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

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const colors = Colors[useColorScheme()];

  const [token, setToken] = useState(params.token ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(undefined);
    setIsSubmitting(true);
    try {
      const result = await api.resetPassword(token.trim(), password);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.replace("/(auth)/login");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Новий пароль</Text>
      <Text style={styles.subtitle}>
        Встав токен із листа й вкажи новий пароль.
      </Text>

      <View style={styles.form}>
        <Input
          label="Токен"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
        />
        <Input
          label="Новий пароль"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
        />
        {error && (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        )}
        <Button
          title={isSubmitting ? "Зберігаємо..." : "Зберегти новий пароль"}
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={!token || !password}
        />
      </View>

      <Link href="/(auth)/login" style={styles.link}>
        <Text style={styles.linkText}>До входу</Text>
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  title: { ...Typography.h2, marginBottom: Spacing.sm },
  subtitle: { ...Typography.body, opacity: 0.7, marginBottom: Spacing.lg },
  form: { gap: Spacing.md },
  error: Typography.small,
  link: { marginTop: Spacing.md, alignItems: "center" },
  linkText: { ...Typography.small, opacity: 0.8, textAlign: "center" },
});
