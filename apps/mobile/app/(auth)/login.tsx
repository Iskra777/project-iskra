import { Link } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from "react-native";

import { Text, View } from "@/components/Themed";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useSession } from "@/lib/session-context";

export default function LoginScreen() {
  const { loginWithPassword } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(undefined);
    setIsSubmitting(true);
    try {
      const result = await loginWithPassword(email.trim(), password);
      if (!result.ok) {
        setError(result.message);
      }
      // Успіх: useProtectedRoute у app/_layout.tsx сам перенаправить на вкладки.
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Iskra</Text>
        <Text style={styles.subtitle}>
          Введіть email і пароль, щоб продовжити.
        </Text>

        <View style={styles.form}>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <Input
            label="Пароль"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Button
            title={isSubmitting ? "Входимо..." : "Увійти"}
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={!email || !password}
          />
        </View>

        <Link href="/(auth)/forgot-password" style={styles.link}>
          <Text style={styles.linkText}>Забули пароль?</Text>
        </Link>
        <Link href="/(auth)/register" style={styles.link}>
          <Text style={styles.linkText}>Немає акаунта? Зареєструватись</Text>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  title: { fontSize: 32, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 15, opacity: 0.7, marginBottom: 24 },
  form: { gap: 16 },
  error: { color: "#EF4444", fontSize: 14 },
  link: { marginTop: 16, alignItems: "center" },
  linkText: { fontSize: 14, opacity: 0.8, textAlign: "center" },
});
