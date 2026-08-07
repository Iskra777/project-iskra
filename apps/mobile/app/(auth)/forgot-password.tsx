import { Link } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";
import * as api from "@/lib/api";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      // Завжди однакова відповідь незалежно від результату — той самий
      // anti-enumeration підхід, що й на бекенді (API.md).
      await api.requestPasswordReset(email.trim());
      setSent(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Скидання пароля</Text>

      {!sent ? (
        <>
          <Text style={styles.subtitle}>
            Введи email — надішлемо посилання для скидання пароля.
          </Text>
          <View style={styles.form}>
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Button
              title={isSubmitting ? "Надсилаємо..." : "Надіслати"}
              onPress={handleSubmit}
              loading={isSubmitting}
              disabled={!email}
            />
          </View>
        </>
      ) : (
        <Text style={styles.subtitle}>
          Якщо такий email зареєстровано, лист із посиланням уже в дорозі.
        </Text>
      )}

      <Link href="/(auth)/reset-password" style={styles.link}>
        <Text style={styles.linkText}>
          Уже маєш токен? Встановити новий пароль
        </Text>
      </Link>
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
  link: { marginTop: Spacing.md, alignItems: "center" },
  linkText: { ...Typography.small, opacity: 0.8, textAlign: "center" },
});
