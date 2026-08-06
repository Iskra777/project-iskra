import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import * as api from "@/lib/api";

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();

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
        {error && <Text style={styles.error}>{error}</Text>}
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
  container: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 8 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 15, opacity: 0.7, marginBottom: 24 },
  form: { gap: 16 },
  error: { color: "#EF4444", fontSize: 14 },
  link: { marginTop: 16, alignItems: "center" },
  linkText: { fontSize: 14, opacity: 0.8, textAlign: "center" },
});
