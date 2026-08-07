import { Link, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { Text, View } from "@/components/Themed";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";

const ERROR_MESSAGES: Record<string, string> = {
  validation_error: "Посилання неповне.",
  invalid_token: "Посилання недійсне або протерміноване.",
};

type Status = "idle" | "loading" | "success" | "error";

export default function VerifyEmailScreen() {
  // Спрацює, коли deep link (iskra://verify-email?token=...) буде
  // налаштовано на рівні застосунку — окрема майбутня задача (App/Play
  // Store association files). До того — ручне вставлення токена нижче.
  const params = useLocalSearchParams<{ token?: string }>();
  const colors = Colors[useColorScheme()];

  const [token, setToken] = useState(params.token ?? "");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | undefined>();

  useEffect(() => {
    if (params.token) {
      void handleVerify(params.token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token]);

  async function handleVerify(tokenToVerify: string) {
    setStatus("loading");
    setMessage(undefined);
    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
      const response = await fetch(`${apiUrl}/api/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client": "mobile" },
        body: JSON.stringify({ token: tokenToVerify }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const code = body?.error?.code as string | undefined;
        setMessage((code && ERROR_MESSAGES[code]) ?? "Щось пішло не так.");
        setStatus("error");
        return;
      }
      setStatus("success");
    } catch {
      setMessage("Немає з'єднання із сервером.");
      setStatus("error");
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Перевірте пошту</Text>

      {status !== "success" && (
        <>
          <Text style={styles.subtitle}>
            Ми надіслали лист із посиланням для підтвердження. Встав токен із
            посилання нижче, щоб підтвердити email.
          </Text>
          <View style={styles.form}>
            <Input
              label="Токен підтвердження"
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
            />
            {message && (
              <Text style={[styles.error, { color: colors.danger }]}>
                {message}
              </Text>
            )}
            <Button
              title={status === "loading" ? "Перевіряємо..." : "Підтвердити"}
              onPress={() => handleVerify(token)}
              loading={status === "loading"}
              disabled={!token}
            />
          </View>
        </>
      )}

      {status === "success" && (
        <Text style={styles.subtitle}>
          Email підтверджено. Тепер можна увійти.
        </Text>
      )}

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
  link: { marginTop: Spacing.lg, alignItems: "center" },
  linkText: { ...Typography.small, opacity: 0.8, textAlign: "center" },
});
