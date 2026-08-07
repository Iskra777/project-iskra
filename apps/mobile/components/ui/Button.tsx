import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from "react-native";

import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";

interface ButtonProps extends PressableProps {
  title: string;
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
}

export function Button({
  title,
  variant = "primary",
  loading,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const isPrimary = variant === "primary";
  const isGhost = variant === "ghost";
  const variantStyle = isPrimary
    ? styles.primary
    : isGhost
      ? styles.ghost
      : styles.secondary;
  const textColorStyle = isPrimary ? styles.textPrimary : styles.textSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        variantStyle,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        typeof style === "function" ? undefined : style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? "#fff" : Colors.dark.tint} />
      ) : (
        <Text style={[styles.text, textColorStyle]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 44,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
  },
  primary: { backgroundColor: Colors.dark.tint },
  // Той самий підхід, що Input.tsx: колір картки (не суцільний темний
  // блок) + тонка світла обвідка для відчутності на дотик.
  secondary: {
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: `${Colors.dark.text}26`,
  },
  // Другорядні дії всередині вже існуючої картки (напр. "Видалити" на
  // пості) — без власного фону чи рамки взагалі, як на вебі variant="ghost".
  ghost: {
    backgroundColor: "transparent",
    height: 32,
    paddingHorizontal: Spacing.sm,
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  text: { fontSize: Typography.body.fontSize, fontWeight: "600" },
  textPrimary: { color: "#fff" },
  textSecondary: { color: Colors.dark.text },
});
