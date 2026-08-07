import { SymbolView } from "expo-symbols";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text, View } from "@/components/Themed";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";
import { useSession } from "@/lib/session-context";

/** Той самий бренд-хедер, що web-компонент nav.tsx (Iskra + блискавка,
 * пошук, вихід) — показується лише на кореневих екранах вкладок
 * (Стрічка/Друзі/Спільноти); Повідомлення й Профіль керують власними
 * заголовками для вкладених екранів (чат, редагування, учасники). */
export function TopBar() {
  const { user, logout } = useSession();
  const router = useRouter();
  const colors = Colors[useColorScheme()];
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + Spacing.sm,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={styles.brand}>
        <Text style={styles.brandText}>Iskra</Text>
        <SymbolView
          name={{ ios: "bolt.fill", android: "bolt", web: "bolt" }}
          tintColor={colors.accent}
          size={16}
        />
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Пошук"
          onPress={() => router.push("/search")}
          style={styles.iconButton}
        >
          <SymbolView
            name={{ ios: "magnifyingglass", android: "search", web: "search" }}
            tintColor={colors.text}
            size={20}
          />
        </Pressable>
        {user && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Вийти"
            onPress={() => logout()}
            style={styles.iconButton}
          >
            <SymbolView
              name={{
                ios: "rectangle.portrait.and.arrow.right",
                android: "logout",
                web: "logout",
              }}
              tintColor={colors.text}
              size={20}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "transparent",
  },
  brandText: { fontSize: Typography.body.fontSize, fontWeight: "700" },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "transparent",
  },
  iconButton: { padding: Spacing.xs },
});
