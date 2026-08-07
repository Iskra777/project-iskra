import { StyleSheet, TextInput, type TextInputProps } from "react-native";

import { Text, View } from "@/components/Themed";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import Spacing from "@/constants/Spacing";
import Typography from "@/constants/Typography";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, ...props }: InputProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme];

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        accessibilityLabel={label ?? props.placeholder}
        placeholderTextColor={colors.tabIconDefault}
        style={[
          styles.input,
          {
            color: colors.text,
            // Без власної рамки — інакше поле в картці читається як окремий
            // "блок у блоці". Легкий відтінок фону + помітніше підкреслення,
            // щоб поле все ж читалось як інтерактивне, а не губилось.
            backgroundColor: `${colors.text}0D`,
            borderBottomColor: error ? colors.danger : colors.tabIconDefault,
            borderBottomWidth: error ? 2 : 1.5,
          },
          style,
        ]}
        {...props}
      />
      {error && (
        <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.xs + 2, backgroundColor: "transparent" },
  label: { fontSize: Typography.small.fontSize, fontWeight: "500" },
  input: {
    height: 44,
    borderRadius: 8,
    paddingHorizontal: Spacing.sm,
    fontSize: Typography.body.fontSize,
  },
  error: { fontSize: Typography.small.fontSize },
});
