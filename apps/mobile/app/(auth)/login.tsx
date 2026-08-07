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
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";
import { useSession } from "@/lib/session-context";

export default function LoginScreen() {
  const { loginWithPassword } = useSession();
  const colors = Colors[useColorScheme()];

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
          {error && (
            <Text style={[styles.error, { color: colors.danger }]}>
              {error}
            </Text>
          )}
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
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  title: { ...Typography.h1, marginBottom: Spacing.xs },
  subtitle: { ...Typography.body, opacity: 0.7, marginBottom: Spacing.lg },
  form: { gap: Spacing.md },
  error: Typography.small,
  link: { marginTop: Spacing.md, alignItems: "center" },
  linkText: { ...Typography.small, opacity: 0.8, textAlign: "center" },
});
