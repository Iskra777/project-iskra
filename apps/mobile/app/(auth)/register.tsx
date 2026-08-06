import { Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";

import { Text, View } from "@/components/Themed";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Colors from "@/constants/Colors";
import { useColorScheme } from "@/components/useColorScheme";
import * as api from "@/lib/api";

export default function RegisterScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(undefined);
    setIsSubmitting(true);
    try {
      const result = await api.register({
        email: email.trim(),
        username: username.trim(),
        password,
        consent: true,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.replace("/(auth)/verify-email");
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
        <Text style={styles.title}>Створити акаунт</Text>

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
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            textContentType="username"
          />
          <Input
            label="Пароль"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
          />

          <Pressable
            style={styles.consentRow}
            onPress={() => setConsent((prev) => !prev)}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: colors.border,
                  backgroundColor: consent ? colors.tint : "transparent",
                },
              ]}
            />
            <Text style={styles.consentText}>
              Я погоджуюсь з політикою приватності
            </Text>
          </Pressable>

          {error && <Text style={styles.error}>{error}</Text>}

          <Button
            title={isSubmitting ? "Реєструємо..." : "Зареєструватись"}
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={!email || !username || !password || !consent}
          />
        </View>

        <Link href="/(auth)/login" style={styles.link}>
          <Text style={styles.linkText}>Вже маєш акаунт? Увійти</Text>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 8 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 24 },
  form: { gap: 16 },
  consentRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5 },
  consentText: { fontSize: 14, flex: 1 },
  error: { color: "#EF4444", fontSize: 14 },
  link: { marginTop: 16, alignItems: "center" },
  linkText: { fontSize: 14, opacity: 0.8, textAlign: "center" },
});
